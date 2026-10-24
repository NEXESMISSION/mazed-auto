import { NextRequest, NextResponse } from "next/server";
import { apiTranslations } from "@/i18n/api";
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { overLimit, tooMany } from "@/lib/http/rateLimit";
import { fail } from "@/lib/http/errors";
import { logAction } from "@/lib/activity";
import { CONSENT_VERSION, socialGate } from "@/lib/social/gate";
import { runJob, type RunOutcome } from "@/lib/social/runner";

/**
 * POST /api/pro/social/requests/[id]/publish — { consent: true, accounts: { facebook?: id, instagram?: id } }
 *
 * Publishes the validated texts now, on the shop's chosen accounts (lot S1:
 * « publication de test avec validation »; scheduling comes in S2).
 *
 *   * consent: without `consent: true` nothing happens; with it, one consent
 *     row (who, what, which networks, which text version) — and the database
 *     refuses any job without it;
 *   * one job per network, keyed by request + network + account + the text's
 *     version: a double click, or a retry of this call, finds the job it
 *     already made instead of making a second one (the key is unique);
 *   * each job is then run through the shared runner, which claims it first.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin0 = getServiceSupabase();
  if (!admin0) return fail("server_misconfigured", 500);
  const { data: request } = await admin0
    .from("social_publication_requests")
    .select("id, shop_id, listing_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!request?.shop_id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gate = await requireShopRole(req, request.shop_id as string, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { admin, user } = gate;
  if (!(await socialGate(admin)).visible) return NextResponse.json({ error: "not_available" }, { status: 404 });
  if (request.status === "cancelled") return NextResponse.json({ error: "cancelled" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { consent?: unknown; accounts?: Record<string, unknown> };
  if (body.consent !== true) {
    return NextResponse.json({ error: "consent_required", detail: (await apiTranslations(req, "social.api"))("consentRequired") }, { status: 400 });
  }
  if (await overLimit(admin, `social_publish:${user.id}`, 20, 3600)) return tooMany();

  const wanted = (["facebook", "instagram"] as const).filter((n) => typeof body.accounts?.[n] === "string");
  if (wanted.length === 0) return NextResponse.json({ error: "bad_request", detail: (await apiTranslations(req, "social.api"))("pickAccount") }, { status: 400 });

  const { data: variants } = await admin
    .from("social_content_variants")
    .select("id, network, version, validated_at")
    .eq("request_id", id)
    .in("network", wanted);
  const byNetwork = new Map((variants ?? []).map((v) => [v.network as string, v]));
  const missing = wanted.filter((n) => !byNetwork.get(n)?.validated_at);
  if (missing.length) {
    const t = await apiTranslations(req, "social.api");
    const names = missing.map((n) => t(`network.${n === "instagram" ? "instagram" : "facebook"}`));
    return NextResponse.json({ error: "variant_not_validated", detail: t("validateFirst", { networks: names.join(t("and")) }) }, { status: 400 });
  }

  const { data: consent, error: cErr } = await admin
    .from("social_consent_logs")
    .insert({ user_id: user.id, request_id: id, listing_id: request.listing_id, scope: "own_accounts", networks: wanted, text_version: CONSENT_VERSION })
    .select("id")
    .single();
  if (cErr || !consent) return fail("social_consent_failed", 500, cErr);

  const outcomes: { network: string; job_id: string | null; outcome: RunOutcome | { status: string; error: string } }[] = [];
  for (const network of wanted) {
    const v = byNetwork.get(network)!;
    const accountId = body.accounts![network] as string;
    const key = createHash("sha256").update(`${id}|${network}|${accountId}|${v.version}`).digest("hex");
    let jobId: string | null = null;
    const { data: job, error } = await admin
      .from("social_publication_jobs")
      .insert({ request_id: id, variant_id: v.id, account_id: accountId, consent_id: consent.id, network, status: "scheduled", idempotency_key: key })
      .select("id")
      .single();
    if (job) jobId = job.id as string;
    else if (error?.code === "23505") {
      const { data: existing } = await admin.from("social_publication_jobs").select("id, status").eq("idempotency_key", key).maybeSingle();
      jobId = (existing?.id as string | undefined) ?? null;
    } else {
      // The database said why: an account of another shop, an inactive account, an annonce gone offline…
      const reason = error?.message ?? (await apiTranslations(req, "social.api"))("refused");
      outcomes.push({ network, job_id: null, outcome: { status: "refused", error: reason } });
      continue;
    }
    outcomes.push({ network, job_id: jobId, outcome: jobId ? await runJob(admin, jobId) : { status: "refused", error: (await apiTranslations(req, "social.api"))("jobMissing") } });
  }

  await admin.from("social_publication_requests").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  logAction(req, user, "social.publish", { requestId: id, networks: wanted, results: outcomes.map((o) => o.outcome.status) });
  return NextResponse.json({ results: outcomes });
}
