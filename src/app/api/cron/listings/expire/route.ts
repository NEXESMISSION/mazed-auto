import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { secretMatches } from "@/lib/cron";
import { log } from "@/lib/log";

/**
 * The end of a listing's life.
 *
 * `listings.expires_at` has been written since 0154 and nothing has ever read
 * it: a published annonce stayed published for ever, so the catalogue can only
 * grow staler, and the two notification kinds the catalogue defines for this —
 * listing_expiring, listing_expired — could never fire.
 *
 * Two passes, both idempotent:
 *   • warn once, three days out, so the seller can renew before it drops off;
 *   • expire everything already past its date.
 *
 * The warning is deduplicated on the notification itself rather than a flag
 * column: one row per listing per kind is the record that it was sent.
 *
 * Auth: the shared CRON_SECRET, as bearer or ?key=.
 */
const WARN_DAYS = 3;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_secret_not_set" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("key") ?? "";
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const now = new Date();
  const soon = new Date(now.getTime() + WARN_DAYS * 86_400_000);

  // ── 1. Expiring soon ──────────────────────────────────────────────────
  const { data: expiring } = await admin
    .from("listings")
    .select("id, title, seller_id, expires_at")
    .eq("status", "published")
    .gt("expires_at", now.toISOString())
    .lte("expires_at", soon.toISOString())
    .limit(500);

  let warned = 0;
  for (const l of expiring ?? []) {
    const { data: already } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", l.seller_id)
      .eq("kind", "listing_expiring")
      .eq("link", `/annonces/${l.id}`)
      .limit(1);
    if (already && already.length > 0) continue;
    const days = Math.max(1, Math.ceil((new Date(l.expires_at as string).getTime() - now.getTime()) / 86_400_000));
    const { error } = await admin.rpc("enqueue_notification", {
      p_user_id: l.seller_id,
      p_kind: "listing_expiring",
      p_title: "Votre annonce expire bientôt",
      p_body: `« ${l.title} » expire dans ${days} jour${days > 1 ? "s" : ""}. Renouvelez-la pour qu'elle reste en ligne.`,
      p_link: `/annonces/${l.id}`,
    });
    if (!error) warned++;
  }

  // ── 2. Already past their date ────────────────────────────────────────
  const { data: expired } = await admin
    .from("listings")
    .select("id, title, seller_id")
    .eq("status", "published")
    .lt("expires_at", now.toISOString())
    .limit(500);

  let closed = 0;
  if (expired && expired.length > 0) {
    const ids = expired.map((l) => l.id);
    const { error } = await admin.from("listings").update({ status: "expired" }).in("id", ids);
    if (error) {
      log.scope("cron").error("listing expiry failed", { msg: error.message });
      return NextResponse.json({ error: "expire_failed" }, { status: 500 });
    }
    closed = ids.length;
    for (const l of expired) {
      await admin.rpc("enqueue_notification", {
        p_user_id: l.seller_id,
        p_kind: "listing_expired",
        p_title: "Votre annonce a expiré",
        p_body: `« ${l.title} » n'est plus visible. Renouvelez-la depuis « Mes annonces ».`,
        p_link: "/account/listings",
      });
    }
    revalidateTag("home-feed", "max");
    revalidateTag("explore-feed", "max");
  }

  return NextResponse.json({ ok: true, warned, expired: closed, at: now.toISOString() });
}

// Some schedulers post rather than get.
export const POST = GET;
