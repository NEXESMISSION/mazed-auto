import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { memberRole, CAN_EDIT_SHOP } from "@/lib/shops/server";
import { apiTranslations } from "@/i18n/api";
import { MAX_PRICE } from "@/lib/listingEdit";

/**
 * POST /api/annonces/[id]/edit — « Modifier » on a live annonce.
 *
 * /tarifs promises « modification à tout moment » and nothing let a seller
 * change a published annonce. Two kinds of change, as the owner decided:
 *
 *   { price, price_on_request, negotiable, show_phone }
 *     Applied at once; the annonce stays online. These change nothing a
 *     moderator checks — what it is, what the photos show, what it says.
 *
 *   { reopen: true }
 *     Everything else (title, description, photos, the car's details, the
 *     contact number) goes back through review: the annonce returns to
 *     'draft', off the catalogue, and the seller edits and sends it again in
 *     the wizard (/annonces/nouvelle?draft=<id>). Editing it while live would
 *     put unreviewed content in front of buyers; the seller is told before.
 *
 * Who may: the annonce's seller, or an owner / manager of its shop — but only
 * the seller reopens it, because the wizard opens the seller's own annonces.
 */
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
    .select("id, seller_id, shop_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  const isSeller = listing.seller_id === user.id;
  let allowed = isSeller;
  if (!allowed && listing.shop_id) {
    const role = await memberRole(admin, user.id, listing.shop_id as string);
    allowed = role !== null && CAN_EDIT_SHOP.includes(role);
  }
  if (!allowed) return NextResponse.json({ error: "not_owner" }, { status: 403 });

  const t = await apiTranslations(req, "publish.api");
  if (listing.status !== "published") {
    return NextResponse.json({ error: "not_published", detail: t("editNotPublished") }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.reopen === true) {
    if (!isSeller) {
      return NextResponse.json({ error: "seller_only", detail: t("editSellerOnly") }, { status: 403 });
    }
    // Compare-and-set, as « Retirer » does: a moderator acting at the same
    // moment wins.
    const { data: done, error } = await admin
      .from("listings")
      .update({ status: "draft" })
      .eq("id", id)
      .eq("status", "published")
      .select("id");
    if (error) return fail("listing_reopen_failed", 500, error);
    if (!done || done.length === 0) {
      return NextResponse.json({ error: "changed", detail: t("changed") }, { status: 409 });
    }
    logAction(req, user, "listing.reopen", { id, shopId: listing.shop_id });
    return NextResponse.json({ ok: true, status: "draft", href: `/annonces/nouvelle?draft=${id}` });
  }

  const fields: Record<string, unknown> = {};
  if ("price_on_request" in body || "price" in body) {
    const onRequest = body.price_on_request === true;
    const price = Number(body.price);
    if (!onRequest && !(Number.isFinite(price) && price > 0 && price <= MAX_PRICE)) {
      return NextResponse.json({ error: "price_invalid", detail: t("editPriceInvalid") }, { status: 400 });
    }
    fields.price_on_request = onRequest;
    fields.price = onRequest ? null : Math.round(price * 100) / 100;
  }
  if ("negotiable" in body) fields.negotiable = body.negotiable === true;
  if ("show_phone" in body) fields.show_phone = body.show_phone !== false;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "nothing_to_change" }, { status: 400 });
  }

  const { data: done, error } = await admin
    .from("listings")
    .update(fields)
    .eq("id", id)
    .eq("status", "published")
    .select("id");
  if (error) return fail("listing_edit_failed", 500, error);
  if (!done || done.length === 0) {
    return NextResponse.json({ error: "changed", detail: t("changed") }, { status: 409 });
  }
  logAction(req, user, "listing.quick_edit", { id, shopId: listing.shop_id, fields: Object.keys(fields) });
  return NextResponse.json({ ok: true });
}
