import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { refusalResponse } from "@/lib/http/refusal";
import { PRODUCT_SELECT, isFree, resolveListingFee, toProduct } from "@/lib/products";
import { decidePublication, publicationErrorFromDb, type ListingType } from "@/lib/publication";
import { quotaStatus, shopSummary } from "@/lib/shops/server";

/**
 * POST /api/annonces/[id]/renew — put an expired annonce back online.
 *
 * Expiry is what keeps the catalog honest (D2), so renewal is the other half of
 * that bargain: nothing is lost, and the listing goes back through the queue —
 * NEVER straight to published. A renewed listing is re-checked, because the
 * reason it is worth publishing is that someone looks at it.
 *
 * It decides exactly as /submit does (`decidePublication`): a shop annonce
 * under its subscription, a personal one free within the limit (D-P1), and —
 * only while `personal_limits.free` is off — the fee, priced by the `renewal`
 * product when one is active, falling back to the ordinary publication fee for
 * that category, because a renewal is a publication.
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

  const suspended = await refuseIfSuspended(admin, user.id);
  if (suspended) return suspended;

  const { data: listing } = await admin
    .from("listings")
    .select("id, seller_id, category_id, status, title, contact_phone, renewed_count, shop_id, listing_type")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  if (listing.seller_id !== user.id) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  // Only something that has actually come down can be renewed. A live listing
  // renewing itself would be paying twice for one publication.
  if (!["expired", "archived", "sold"].includes(listing.status as string)) {
    return NextResponse.json(
      {
        error: "not_renewable",
        detail: "Cette annonce est encore en ligne ou en cours de traitement.",
      },
      { status: 409 },
    );
  }
  if (!listing.contact_phone) {
    return NextResponse.json(
      { error: "contact_required", detail: "Ajoutez un numéro joignable avant de renouveler." },
      { status: 400 },
    );
  }

  // ── Who pays: a subscription, the free personal allowance, or a fee ───────
  const shopId = (listing.shop_id as string | null) ?? null;
  const [shop, quota] = await Promise.all([
    shopId ? shopSummary(admin, shopId) : Promise.resolve(null),
    quotaStatus(admin, user.id, shopId, listing.listing_type as ListingType, id),
  ]);
  const decision = decidePublication({ shopId, shop, quota });
  if (decision.kind === "refused") return refusalResponse(decision);

  if (decision.kind !== "legacy_fee") {
    const reason = decision.kind === "subscription" ? "subscription" : "personal_free";
    const { error } = await admin
      .from("listings")
      .update({
        status: "pending_review",
        rejection_reason: null,
        fee_waived_reason: reason,
        fee_payment_id: null,
        seller_credit_id: null,
        renewed_count: (listing.renewed_count as number) + 1,
      })
      .eq("id", id);
    if (error) {
      const refusal = publicationErrorFromDb(error);
      return refusal ? refusalResponse(refusal) : fail("listing_renew_failed", 500, error);
    }

    const remaining = Math.max(quota.remaining - 1, 0);
    logAction(req, user, `listing.renew.${reason}`, { id, shopId, remaining });
    return NextResponse.json({ status: "pending_review", paidWith: reason, remaining });
  }

  // ── The per-annonce fee: only while `personal_limits.free` is off ─────────
  // ── A credit, if they hold one ────────────────────────────────────────────
  const { data: credited } = await admin.rpc("consume_listing_credit", {
    p_seller: user.id,
    p_listing: id,
    p_actor: user.id,
  });

  if (credited?.ok === true) {
    await admin
      .from("listings")
      .update({
        status: "pending_review",
        rejection_reason: null,
        renewed_count: (listing.renewed_count as number) + 1,
      })
      .eq("id", id);

    logAction(req, user, "listing.renew.credit", { id, remaining: credited.remaining });
    return NextResponse.json({
      status: "pending_review",
      paidWith: "credit",
      remaining: credited.remaining,
    });
  }

  // ── Otherwise it is paid for ──────────────────────────────────────────────
  const { data: prodRows } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true);
  const products = (prodRows ?? []).map((r) => toProduct(r as Parameters<typeof toProduct>[0]));

  const { data: cat } = await admin
    .from("categories")
    .select("parent_id")
    .eq("id", listing.category_id as string)
    .maybeSingle();
  const categoryFee = resolveListingFee(
    products,
    listing.category_id as string,
    (cat?.parent_id as string | null) ?? null,
  );

  // A dedicated renewal price if the admin set one; otherwise the ordinary
  // publication fee for this category, because that is what a renewal is.
  // Exception first: a category that publishes for free renews for free.
  // Charging 15 TND to keep a free annonce alive would be a trap.
  const renewal = isFree(categoryFee)
    ? categoryFee
    : products.find((p) => p.kind === "renewal") ?? categoryFee;
  if (!renewal) return fail("no_price_configured", 503);

  if (renewal.price <= 0) {
    const { error } = await admin
      .from("listings")
      .update({
        status: "pending_review",
        rejection_reason: null,
        renewed_count: (listing.renewed_count as number) + 1,
      })
      .eq("id", id);
    if (error) return fail("listing_renew_failed", 500, error);

    logAction(req, user, "listing.renew.free", { id, productSlug: renewal.slug });
    return NextResponse.json({ status: "pending_review", paidWith: "free" });
  }

  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", "listing_fee")
    .in("status", ["pending", "pending_review"])
    .contains("metadata", { listing_id: id })
    .limit(1);

  let paymentId = existing?.[0]?.id as string | undefined;
  if (!paymentId) {
    const { data: created, error } = await admin
      .from("payments")
      .insert({
        user_id: user.id,
        kind: "listing_fee",
        provider: "bank_transfer",
        amount: renewal.price,
        status: "pending",
        metadata: {
          listing_id: id,
          product_id: renewal.id,
          product_slug: renewal.slug,
          duration_days: renewal.durationDays,
          renewal: true,
          initiated_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (error || !created) return fail("payment_create_failed", 500, error);
    paymentId = created.id as string;
  }

  await admin
    .from("listings")
    .update({
      status: "pending_payment",
      fee_payment_id: paymentId,
      renewed_count: (listing.renewed_count as number) + 1,
    })
    .eq("id", id);

  logAction(req, user, "listing.renew.payment", { id, paymentId, amount: renewal.price });
  return NextResponse.json({
    status: "pending_payment",
    paidWith: "payment",
    paymentId,
    amount: renewal.price,
  });
}
