import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { decryptToken } from "./crypto";
import { findRecent, MetaError, metaConfig, publishFacebook, publishInstagram, type Published } from "./meta";
import { finalText } from "./templates";
import { socialLink, type SocialNetwork } from "./utm";

/**
 * Running one publication job — shared by « Publier maintenant » and, from lot
 * S2, the scheduled worker. The job is CLAIMED first (`social_claim_job`, one
 * winner), so it is published at most once however many callers race; every
 * attempt leaves a `social_publication_results` row; what happens next follows
 * the kind of failure (see meta.ts):
 *
 *   published  → published, with Meta's id and link
 *   token      → manual_action_required, the account marked expired, the shop told
 *   rate       → scheduled again in 15 minutes
 *   transient  → scheduled again in 5 minutes (5 attempts, then failed)
 *   rejected   → failed, with Meta's reason
 *   ambiguous  → stays « publishing » with needs_remote_check: nobody resends
 *                until Meta has been asked whether the post exists (`checkRemote`).
 */

export type RunOutcome =
  | { status: "published"; url: string | null }
  | { status: "not_claimed" }
  | { status: "scheduled" | "failed" | "manual_action_required" | "needs_remote_check"; error: string };

type JobRow = {
  id: string; request_id: string; variant_id: string; account_id: string; network: SocialNetwork;
  attempts: number; updated_at: string;
};

async function context(admin: SupabaseClient, job: JobRow) {
  const [{ data: variant }, { data: account }, { data: request }] = await Promise.all([
    admin.from("social_content_variants").select("body, hashtags, media").eq("id", job.variant_id).single(),
    admin.from("social_accounts").select("id, external_id, token_ciphertext, status, shop_id").eq("id", job.account_id).single(),
    admin.from("social_publication_requests").select("listing_id, shop_id").eq("id", job.request_id).single(),
  ]);
  return { variant, account, request };
}

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function record(admin: SupabaseClient, job: JobRow, outcome: string, extra: Record<string, unknown> = {}) {
  await admin.from("social_publication_results").insert({ job_id: job.id, attempt: job.attempts, outcome, ...extra });
}

async function markPublished(admin: SupabaseClient, job: JobRow, p: Published, outcome: "published" | "remote_found") {
  await admin.from("social_publication_jobs").update({
    status: "published", external_id: p.id, external_url: p.url, published_at: new Date().toISOString(),
    needs_remote_check: false, last_error: null,
  }).eq("id", job.id);
  await record(admin, job, outcome, { external_id: p.id });
}

export async function runJob(admin: SupabaseClient, jobId: string): Promise<RunOutcome> {
  const { data: claimed } = await admin.rpc("social_claim_job", { p_job: jobId });
  const job = (claimed as JobRow | null)?.id ? (claimed as JobRow) : null;
  if (!job) return { status: "not_claimed" };

  const fail = async (status: "failed" | "manual_action_required", error: string, outcome = "failed", extra: Record<string, unknown> = {}) => {
    await admin.from("social_publication_jobs").update({ status, last_error: error }).eq("id", job.id);
    await record(admin, job, outcome, { error_message: error, ...extra });
    return { status, error } as RunOutcome;
  };

  const { variant, account, request } = await context(admin, job);
  if (!variant || !account || !request) return fail("failed", "Publication incomplète (texte, compte ou demande introuvable).");

  // The annonce may have gone offline between the click and now.
  const { data: listing } = await admin.from("listings").select("status").eq("id", request.listing_id).single();
  if (listing?.status !== "published") return fail("failed", "L'annonce n'est plus en ligne : rien n'a été publié.");

  const cfg = metaConfig();
  if (!cfg) return fail("failed", "La connexion Meta n'est pas configurée.");
  const token = account.status === "active" ? decryptToken(account.token_ciphertext as string | null) : null;
  if (!token) return fail("manual_action_required", "Le compte doit être reconnecté.", "token_invalid");

  const text = finalText(job.network, variant.body as string, (variant.hashtags as string[]) ?? [], socialLink(request.listing_id as string, job.network, job.id));
  const imageUrls = ((variant.media as { url: string }[]) ?? []).map((m) => m.url);
  const startedAt = new Date().toISOString();

  try {
    const p = job.network === "facebook"
      ? await publishFacebook(cfg, account.external_id as string, token, { message: text, imageUrls })
      : await publishInstagram(cfg, account.external_id as string, token, { caption: text, imageUrls });
    await markPublished(admin, job, p, "published");
    return { status: "published", url: p.url };
  } catch (e) {
    const err = e instanceof MetaError ? e : new MetaError((e as Error).message, "transient", null);
    const extra = { http_status: err.status, error_code: err.code != null ? String(err.code) : null, error_message: err.message, detail: { text_sent: text, started_at: startedAt } };
    log.scope("social").warn(`job ${job.id} ${err.kind}`, { message: err.message, code: err.code });

    if (err.kind === "token") {
      await admin.from("social_accounts").update({ status: "expired", last_error: err.message }).eq("id", account.id);
      const { data: shop } = await admin.from("shops").select("owner_id").eq("id", account.shop_id).maybeSingle();
      if (shop?.owner_id) {
        await admin.rpc("enqueue_notification", {
          p_user_id: shop.owner_id, p_kind: "social_account_expired", p_title: "Compte social à reconnecter",
          p_body: "Meta n'accepte plus l'accès à votre Page. Reconnectez-la depuis Marketing pour reprendre les publications.",
          p_link: "/pro/dashboard/marketing",
        }).then(() => {}, () => {});
      }
      return fail("manual_action_required", "Meta a refusé l'accès : reconnectez le compte.", "token_invalid", extra);
    }
    if (err.kind === "ambiguous") {
      await admin.from("social_publication_jobs").update({ needs_remote_check: true, last_error: "Réponse incertaine de Meta : vérification avant toute nouvelle tentative." }).eq("id", job.id);
      await record(admin, job, "ambiguous", extra);
      return { status: "needs_remote_check", error: err.message };
    }
    if (err.kind === "rate" || (err.kind === "transient" && job.attempts < 5)) {
      await admin.from("social_publication_jobs").update({ status: "scheduled", scheduled_at: later(err.kind === "rate" ? 15 : 5), last_error: err.message }).eq("id", job.id);
      await record(admin, job, err.kind === "rate" ? "rate_limited" : "failed", extra);
      return { status: "scheduled", error: err.message };
    }
    return fail("failed", err.message, "failed", extra);
  }
}

/**
 * After an ambiguous answer: is the post on the account? Found → published.
 * Absent and the attempt is older than 5 minutes → scheduled again, the one
 * case where a resend is safe. Absent but recent → still waiting.
 */
export async function checkRemote(admin: SupabaseClient, jobId: string): Promise<RunOutcome> {
  const { data: job } = await admin
    .from("social_publication_jobs")
    .select("id, request_id, variant_id, account_id, network, attempts, updated_at, status, needs_remote_check")
    .eq("id", jobId)
    .single();
  if (!job || job.status !== "publishing" || !job.needs_remote_check) return { status: "not_claimed" };
  const { data: last } = await admin
    .from("social_publication_results")
    .select("detail, created_at")
    .eq("job_id", jobId)
    .eq("outcome", "ambiguous")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sent = (last?.detail as { text_sent?: string; started_at?: string } | null) ?? {};
  const cfg = metaConfig();
  const { account } = await context(admin, job as JobRow);
  const token = account ? decryptToken(account.token_ciphertext as string | null) : null;
  if (!cfg || !account || !token || !sent.text_sent) {
    return { status: "needs_remote_check", error: "Vérification impossible pour l'instant." };
  }
  try {
    const found = await findRecent(cfg, job.network as SocialNetwork, account.external_id as string, token, sent.text_sent, new Date(sent.started_at ?? last!.created_at));
    if (found) {
      await markPublished(admin, job as JobRow, found, "remote_found");
      return { status: "published", url: found.url };
    }
    if (Date.now() - new Date(last?.created_at ?? job.updated_at).getTime() < 5 * 60_000) {
      return { status: "needs_remote_check", error: "Pas encore visible chez Meta : nouvelle vérification dans quelques minutes." };
    }
    await admin.rpc("social_requeue_job", { p_job: jobId });
    await admin.from("social_publication_jobs").update({ last_error: "Absente chez Meta après vérification : peut être relancée." }).eq("id", jobId);
    await record(admin, job as JobRow, "remote_absent");
    return { status: "scheduled", error: "Absente chez Meta : la publication peut être relancée." };
  } catch (e) {
    return { status: "needs_remote_check", error: (e as Error).message };
  }
}
