import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { clientIp } from "@/lib/clientIp";
import { fail } from "@/lib/http/errors";
import { log } from "@/lib/log";

/**
 * POST /api/annonces/[id]/contact — reveal the seller's number, once, on demand.
 *
 * This endpoint exists because of a decision made in the schema: `contact_phone`
 * is granted to service_role alone (0154). No browser can read it, signed in or
 * not. The number reaches a buyer only through here, which means:
 *
 *   • it is never in the page HTML, so it cannot be scraped without asking;
 *   • every reveal is a row in contact_reveals — the anti-harvesting signal
 *     (a burst from one ip_hash is a bot, not a buyer) and the sellers' proof
 *     that their listing is working;
 *   • it is rate-limited per IP, so the whole catalog cannot be walked.
 *
 * Only PUBLISHED listings reveal, and only when the seller left show_phone on.
 * The IP is hashed, never stored raw.
 */

const MAX_REVEALS_PER_IP_PER_HOUR = 40;

function hashIp(ip: string): string {
  // Salted with a server secret so the table cannot be reversed into a list of
  // IP addresses by anyone who gets a copy of it.
  const salt = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mazed";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const ip = clientIp(req) || "unknown";
  const ipHash = hashIp(ip);

  // Per-IP throttle. A buyer looks at a handful of listings in an evening; a
  // harvester looks at hundreds. check_rate_limit records the hit and returns
  // true once over the cap.
  const { data: over } = await admin.rpc("check_rate_limit", {
    p_key: `reveal:${ipHash}`,
    p_max: MAX_REVEALS_PER_IP_PER_HOUR,
    p_window_secs: 3600,
  });
  if (over === true) {
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: "Trop de numéros consultés depuis cet appareil. Réessayez plus tard.",
      },
      { status: 429 },
    );
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, status, show_phone, contact_phone, contact_whatsapp, contact_name, seller_id, title")
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.status !== "published") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  if (!listing.show_phone || !listing.contact_phone) {
    return NextResponse.json(
      { error: "hidden", detail: "Ce vendeur ne partage pas son numéro." },
      { status: 403 },
    );
  }

  // Who asked, if they are signed in. Anonymous reveals are still logged (by
  // ip_hash) — that is the half that catches scraping.
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  await admin.from("contact_reveals").insert({
    listing_id: id,
    user_id: user?.id ?? null,
    ip_hash: ipHash,
  });

  // Cheap denormalised counter for the listing's "X personnes ont demandé ce
  // numéro" line, and for the seller's dashboard. contact_reveals stays the
  // source of truth; this is just the number we render.
  //
  // Errors are logged, not swallowed: supabase-js RESOLVES with { error } for a
  // missing function rather than rejecting, so a .catch() here would silently
  // do nothing — which is exactly how this counter sat at 0 while the reveal
  // log filled up correctly.
  const { error: countErr } = await admin.rpc("increment_contact_reveals", {
    p_listing: id,
  });
  if (countErr) {
    log.scope("api").warn(`reveal counter not incremented: ${countErr.message}`);
  }

  // ── Tell the seller ──────────────────────────────────────────────────────
  // Someone asking for the number is the only signal this product generates
  // that is worth money to a seller: it is the moment their annonce did its
  // job. It was recorded in contact_reveals and told to NOBODY — sellers had
  // to open the site and hope to notice a counter had moved.
  //
  // Once per listing per hour: a buyer who reveals, closes the tab and comes
  // back should not ping the seller twice, and a bot that gets past the IP
  // throttle should not become a notification storm. The reveal itself is
  // always logged; only the ping is throttled.
  if (listing.seller_id) {
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", listing.seller_id)
      .eq("kind", "contact_revealed")
      // Match on `link`, not on payload: enqueue_notification takes no payload
      // argument, so payload is always null here and a payload filter matched
      // nothing — the throttle silently never fired and a buyer who revealed
      // twice pinged the seller twice.
      .eq("link", `/annonces/${id}`)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
      .limit(1);

    if (!recent || recent.length === 0) {
      const { error: notifyErr } = await admin.rpc("enqueue_notification", {
        p_user_id: listing.seller_id,
        p_kind: "contact_revealed",
        p_title: "Un acheteur a demandé votre numéro",
        p_body: listing.title
          ? `Quelqu'un vient de demander votre numéro pour « ${listing.title} ». Gardez votre téléphone à portée.`
          : "Quelqu'un vient de demander votre numéro. Gardez votre téléphone à portée.",
        p_link: `/annonces/${id}`,
      });
      // Never fail the buyer's reveal because the seller's ping did not send.
      if (notifyErr) {
        log.scope("api").warn(`reveal notification failed: ${notifyErr.message}`);
      }
    }
  }

  return NextResponse.json({
    phone: listing.contact_phone,
    whatsapp: listing.contact_whatsapp,
    name: listing.contact_name,
  });
}
