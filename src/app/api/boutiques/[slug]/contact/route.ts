import { NextRequest, NextResponse } from "next/server";
import { apiTranslations } from "@/i18n/api";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { overRevealLimit, revealIpHash, revealLimitedDetail } from "@/lib/http/revealLimit";
import { shopViewer } from "@/lib/shops/public";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/boutiques/[slug]/contact — a shop's phone and WhatsApp, on demand.
 *
 * Same rule as an annonce's number (/api/annonces/[id]/contact): `shops.phone`
 * is not granted to anon or authenticated (0185), so it is never in the page
 * HTML and reaches a visitor only through here — once they ask, from a device
 * that has not already asked forty times this hour. Only an ACTIVE shop
 * answers, and only while shop pages are public (or for an admin previewing
 * them).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const { slug } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const ipHash = revealIpHash(req);
  if (await overRevealLimit(admin, ipHash)) {
    return NextResponse.json({ error: "rate_limited", detail: revealLimitedDetail(req) }, { status: 429 });
  }

  const { data: shop } = await admin
    .from("shops")
    .select("id, name, phone, whatsapp, status")
    .eq("slug", slug)
    .maybeSingle();
  // Same answer for a missing shop, an inactive one, and one whose page this
  // visitor may not see yet (`shopViewer`: public, admin, or its own members).
  if (!shop || shop.status !== "active" || !(await shopViewer(admin, shop.id as string))) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  if (!shop.phone && !shop.whatsapp) {
    return NextResponse.json(
      { error: "hidden", detail: (await apiTranslations(req, "shops.api"))("hidden") },
      { status: 403 },
    );
  }

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  logAction(req, user, "shop.contact_reveal", { shopId: shop.id, ipHash });
  // The shop's statistics (0193): once a day per visitor, members excluded.
  await admin.rpc("record_shop_event", {
    p_shop: shop.id,
    p_listing: null,
    p_kind: "phone_reveal",
    p_viewer_key: user ? `u:${user.id}` : `a:${ipHash}`,
    p_user: user?.id ?? null,
  });

  return NextResponse.json({
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    name: shop.name,
  });
}
