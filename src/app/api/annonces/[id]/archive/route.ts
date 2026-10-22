import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { memberRole, CAN_EDIT_SHOP } from "@/lib/shops/server";

/**
 * POST /api/annonces/[id]/archive — take an annonce off the catalogue.
 *
 * The seller's own « Retirer », which /tarifs has always promised and no route
 * offered: until now only an admin could take an annonce down. It is also how
 * a seller makes room under their limit (0189) — an archived annonce stops
 * counting at once — so it must exist before limits mean anything.
 *
 * Who may: the annonce's seller, or the owner / a manager of the shop it is
 * published under. What: an annonce that is live or waiting for review goes to
 * 'archived'. Nothing is deleted; « Renouveler » brings it back through
 * moderation.
 */
const WITHDRAWABLE = ["published", "pending_review"];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { data: listing } = await admin
    .from("listings")
    .select("id, seller_id, shop_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  let allowed = listing.seller_id === user.id;
  if (!allowed && listing.shop_id) {
    const role = await memberRole(admin, user.id, listing.shop_id as string);
    allowed = role !== null && CAN_EDIT_SHOP.includes(role);
  }
  if (!allowed) return NextResponse.json({ error: "not_owner" }, { status: 403 });

  if (!WITHDRAWABLE.includes(listing.status as string)) {
    return NextResponse.json(
      { error: "not_withdrawable", detail: "Cette annonce n'est ni en ligne ni en vérification." },
      { status: 409 },
    );
  }

  // Compare-and-set on the status read above: a moderator acting at the same
  // moment wins, and this answers 409 instead of overwriting their decision.
  const { data: done, error } = await admin
    .from("listings")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("status", listing.status as string)
    .select("id");
  if (error) return fail("listing_archive_failed", 500, error);
  if (!done || done.length === 0) {
    return NextResponse.json({ error: "changed", detail: "L'annonce a changé d'état entre-temps." }, { status: 409 });
  }

  logAction(req, user, "listing.archive", { id, shopId: listing.shop_id });
  return NextResponse.json({ ok: true, status: "archived" });
}
