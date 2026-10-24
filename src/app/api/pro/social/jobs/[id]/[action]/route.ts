import { NextRequest, NextResponse } from "next/server";
import { apiTranslations } from "@/i18n/api";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { overLimit, tooMany } from "@/lib/http/rateLimit";
import { fail } from "@/lib/http/errors";
import { logAction } from "@/lib/activity";
import { checkRemote, runJob } from "@/lib/social/runner";

/**
 * POST /api/pro/social/jobs/[id]/check | retry | cancel
 *
 *   check   after an uncertain answer from Meta: is the post there? (never a resend)
 *   retry   a failed job, a job back from « manual action » once the account is
 *           reconnected, or one Meta confirmed absent — run again, now
 *   cancel  a job not yet published
 */
const RETRYABLE = ["failed", "manual_action_required", "scheduled"];
const CANCELLABLE = ["draft", "pending_approval", "scheduled", "failed", "manual_action_required"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  if (!["check", "retry", "cancel"].includes(action)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin0 = getServiceSupabase();
  if (!admin0) return fail("server_misconfigured", 500);
  const { data: job } = await admin0
    .from("social_publication_jobs")
    .select("id, status, request:social_publication_requests (shop_id)")
    .eq("id", id)
    .maybeSingle();
  const request = job ? (Array.isArray(job.request) ? job.request[0] : job.request) as { shop_id: string } | null : null;
  if (!job || !request?.shop_id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gate = await requireShopRole(req, request.shop_id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { admin, user } = gate;
  if (await overLimit(admin, `social_job:${user.id}`, 60, 3600)) return tooMany();

  let result;
  if (action === "check") {
    result = await checkRemote(admin, id);
  } else if (action === "retry") {
    if (!RETRYABLE.includes(job.status as string)) {
      return NextResponse.json({ error: "not_retryable", detail: (await apiTranslations(req, "social.api"))("notRetryable") }, { status: 409 });
    }
    // Due now by the database's clock (social_requeue_job), then run.
    const { data: requeued, error } = await admin.rpc("social_requeue_job", { p_job: id });
    if (error || !(requeued as { id?: string } | null)?.id) {
      return NextResponse.json({ error: "not_retryable", detail: error?.message ?? (await apiTranslations(req, "social.api"))("notRetryable") }, { status: 409 });
    }
    result = await runJob(admin, id);
  } else {
    if (!CANCELLABLE.includes(job.status as string)) {
      return NextResponse.json({ error: "not_cancellable", detail: (await apiTranslations(req, "social.api"))("notCancellable") }, { status: 409 });
    }
    await admin.from("social_publication_jobs").update({ status: "cancelled", last_error: "Annulée par la boutique." }).eq("id", id);
    result = { status: "cancelled" };
  }
  logAction(req, user, `social.job.${action}`, { id, status: result.status });
  return NextResponse.json(result);
}
