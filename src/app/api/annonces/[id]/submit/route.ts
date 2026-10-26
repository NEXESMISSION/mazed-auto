import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { refusalResponse as sendRefusal } from "@/lib/http/refusal";
import { PRODUCT_SELECT, resolveListingFee, toProduct } from "@/lib/products";
import {
  decidePublication, localizeRefusal, publicationErrorFromDb, shopForPersonalDraft,
  type ListingType, type Refusal,
} from "@/lib/publication";
import { apiTranslations, localeFromRequest } from "@/i18n/api";
import { manualPaymentOpen } from "@/lib/payments";
import { memberShops, quotaStatus, shopSummary } from "@/lib/shops/server";

/**
 * POST /api/annonces/[id]/submit — send a draft listing for publication.
 *
 * This is the one place that decides how a publication is paid for, and it
 * decides server-side because the client must never get a vote on price.
 * `decidePublication` (src/lib/publication.ts) picks one of:
 *
 *   • a shop annonce, under a current subscription and within its plan's
 *     limit                                     → straight to verification
 *   • a personal annonce within the free limit (1 vehicle, 5 parts live —
 *     D-P1)                                      → straight to verification
 *   • refused: limit reached, no subscription, shop not active — with a
 *     sentence for the seller
 *   • only while `personal_limits.free` is switched off, the per-annonce fee,
 *     in the order it has always had:
 *       0. the category costs nothing           → straight to verification
 *       0b. a welcome allowance left            → straight to verification
 *       1. a pack with quota left               → spend one credit
 *       2. otherwise                            → a `listing_fee` payment for
 *          THIS category's price; the listing waits in `pending_payment`
 *          until an admin captures the receipt.
 *
 * The limit itself is enforced by the database (`_listings_quota`, 0189); the
 * check here only answers before it does.
 *
 * Returns { status: "pending_review" } or { status: "pending_payment", paymentId }.
 *
 * Publication itself never happens here — `_listings_guard_publish` (0154)
 * refuses any status jump to 'published' that isn't the admin/service path, so
 * a forged request can reach the queue at worst, never the catalog.
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

  // The seller reads these, and the notification below goes to the same
  // person: both in the language of the page they submitted from.
  const t = await apiTranslations(req, "publish");
  const locale = localeFromRequest(req);
  const refusalResponse = (r: Refusal) => sendRefusal(localizeRefusal(r, locale));

  const { data: listing } = await admin
    .from("listings")
    .select("id, seller_id, category_id, status, title, contact_phone, seller_attestation_version, shop_id, listing_type, fee_payment_id")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  if (listing.seller_id !== user.id) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  // Only a draft (or a listing that came back rejected, or one whose payment
  // was abandoned) may be submitted. Re-submitting something already in the
  // queue would spend a second credit for one publication.
  const submittable = ["draft", "rejected", "pending_payment"];
  if (!submittable.includes(listing.status as string)) {
    return NextResponse.json(
      { error: "not_submittable", detail: t("api.notSubmittable", { status: statusWord(t, listing.status as string) }) },
      { status: 409 },
    );
  }

  // Two things a listing cannot go live without, checked before any money moves.
  if (!listing.contact_phone) {
    return NextResponse.json(
      { error: "contact_required", detail: t("api.contactRequired") },
      { status: 400 },
    );
  }
  if (!listing.seller_attestation_version) {
    return NextResponse.json(
      { error: "attestation_required", detail: t("api.attestationRequired") },
      { status: 400 },
    );
  }

  const { count: photoCount } = await admin
    .from("listing_photos")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);
  if ((photoCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "photo_required", detail: t("api.photoRequired") },
      { status: 400 },
    );
  }

  // ── Who pays: a subscription, the free personal allowance, or a fee ───────
  let shopId = (listing.shop_id as string | null) ?? null;
  const listingType = listing.listing_type as ListingType;
  let [shop, quota] = await Promise.all([
    shopId ? shopSummary(admin, shopId) : Promise.resolve(null),
    quotaStatus(admin, user.id, shopId, listingType, id),
  ]);
  let decision = decidePublication({ shopId, shop, quota });

  // A personal draft saved at the personal limit (« enregistrée, mais pas mise
  // en ligne »), by a seller who has opened a shop since — the limit screen
  // sends them there. It goes out through the shop instead of staying stuck
  // over the personal limit. Only when the shop can take it right now; if not,
  // the personal refusal stands and says why.
  if (!shopId && decision.kind === "refused" && decision.error === "quota_exceeded") {
    const target = shopForPersonalDraft(await memberShops(admin, user.id), listingType);
    if (target) {
      const targetQuota = await quotaStatus(admin, user.id, target.id, listingType, id);
      const viaShop = decidePublication({ shopId: target.id, shop: target, quota: targetQuota });
      if (viaShop.kind === "subscription") {
        const { error } = await admin.from("listings").update({ shop_id: target.id }).eq("id", id);
        if (!error) {
          shopId = target.id;
          shop = target;
          quota = targetQuota;
          decision = viaShop;
          logAction(req, user, "listing.rescope", { id, shopId });
        }
      }
    }
  }
  if (decision.kind === "refused") return refusalResponse(decision);

  if (decision.kind !== "legacy_fee") {
    const reason = decision.kind === "subscription" ? "subscription" : "personal_free";

    // A listing that was waiting on a fee no longer owes it. A payment still
    // `pending` (no receipt yet) is cancelled, compare-and-set like the
    // seller's own cancel button, so a receipt can never be captured later
    // for an annonce that went out free. One already under review means money
    // may have moved: that one is left to an admin.
    if (listing.status === "pending_payment" && listing.fee_payment_id) {
      const { data: open } = await admin
        .from("payments")
        .select("id, status")
        .eq("id", listing.fee_payment_id as string)
        .maybeSingle();
      if (open?.status === "pending_review") {
        return NextResponse.json(
          {
            error: "payment_under_review",
            detail: t("api.paymentUnderReview"),
          },
          { status: 409 },
        );
      }
      if (open?.status === "pending") {
        await admin
          .from("payments")
          .update({
            status: "failed",
            admin_notes: reason === "subscription"
              ? "Annulé : publication couverte par l'abonnement de la boutique"
              : "Annulé : publication gratuite pour un particulier",
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", open.id as string)
          .eq("status", "pending");
      }
    }

    const { error } = await admin
      .from("listings")
      .update({
        status: "pending_review",
        rejection_reason: null,
        fee_waived_reason: reason,
        // Unlink only the fee that was never paid; a captured one (an annonce
        // paid for, rejected, now resubmitted) stays on the record.
        ...(listing.status === "pending_payment" ? { fee_payment_id: null } : {}),
      })
      .eq("id", id);
    if (error) {
      const refusal = publicationErrorFromDb(error);
      return refusal ? refusalResponse(refusal) : fail("listing_submit_failed", 500, error);
    }

    await admin
      .rpc("enqueue_notification", {
        p_user_id: user.id,
        p_kind: "listing_submitted",
        p_title: t("api.notif.submittedTitle"),
        p_body: reason === "subscription"
          ? t("api.notif.subscription", { title: listing.title as string, shop: shop?.name ?? t("api.notif.yourShop") })
          : t("api.notif.personalFree", { title: listing.title as string }),
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    const remaining = Math.max(quota.remaining - 1, 0);
    logAction(req, user, `listing.submit.${reason}`, { id, shopId, remaining });
    return NextResponse.json({ status: "pending_review", paidWith: reason, remaining });
  }

  // ── The per-annonce fee: only while `personal_limits.free` is off ─────────
  // ── 1. A pack credit, if they have one ────────────────────────────────────
  const { data: credited } = await admin.rpc("consume_listing_credit", {
    p_seller: user.id,
    p_listing: id,
    p_actor: user.id,
  });

  if (credited?.ok === true) {
    await admin
      .from("listings")
      .update({ status: "pending_review", rejection_reason: null })
      .eq("id", id);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: user.id,
        p_kind: "listing_submitted",
        p_title: t("api.notif.submittedTitle"),
        p_body: t("api.notif.credit", { title: listing.title as string, count: credited.remaining }),
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    logAction(req, user, "listing.submit.credit", { id, remaining: credited.remaining });
    return NextResponse.json({
      status: "pending_review",
      paidWith: "credit",
      remaining: credited.remaining,
    });
  }

  // ── 2. Otherwise it is paid for, at this category's price ─────────────────
  const { data: prodRows } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true);
  const products = (prodRows ?? []).map((r) => toProduct(r as Parameters<typeof toProduct>[0]));
  // The parent category too, so a price set on « Pièces de rechange » covers
  // every part sub-category (0167).
  const { data: cat } = await admin
    .from("categories")
    .select("parent_id")
    .eq("id", listing.category_id as string)
    .maybeSingle();

  const fee = resolveListingFee(
    products,
    listing.category_id as string,
    (cat?.parent_id as string | null) ?? null,
  );

  if (!fee) {
    // No price configured is NOT "free" — it is a misconfiguration, and
    // publishing for nothing would be a silent revenue hole.
    return fail("no_price_configured", 503);
  }

  // ── 2a. Priced at zero: free on purpose ───────────────────────────────────
  // Spare parts, today. A payment row for 0 TND would send the seller to a
  // checkout to upload a receipt for nothing, and leave the annonce stuck in
  // `pending_payment` waiting for an admin to capture an empty payment.
  if (fee.price <= 0) {
    const { error } = await admin
      .from("listings")
      .update({ status: "pending_review", rejection_reason: null })
      .eq("id", id);
    if (error) return fail("listing_submit_failed", 500, error);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: user.id,
        p_kind: "listing_submitted",
        p_title: t("api.notif.submittedTitle"),
        p_body: t("api.notif.freeCategory", { title: listing.title as string }),
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    logAction(req, user, "listing.submit.free", { id, productSlug: fee.slug });
    return NextResponse.json({ status: "pending_review", paidWith: "free" });
  }

  // ── 2b. The welcome allowance ─────────────────────────────────────────────
  // Deliberately AFTER the price is resolved. A category that is already free
  // returns above, so a spare part never burns a slot the seller could have
  // spent on a car — the allowance only ever pays for something that would
  // otherwise have cost money.
  //
  // The count and the claim happen inside `consume_free_listing`, under an
  // advisory lock on the seller: two submits arriving together would both read
  // the same "1 of 3 used" and both take the second slot.
  const { data: waived } = await admin.rpc("consume_free_listing", {
    p_listing_id: id,
    p_seller_id: user.id,
  });

  if (waived?.ok === true) {
    const { error } = await admin
      .from("listings")
      .update({ status: "pending_review", rejection_reason: null })
      .eq("id", id);
    if (error) return fail("listing_submit_failed", 500, error);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: user.id,
        p_kind: "listing_submitted",
        p_title: t("api.notif.submittedTitle"),
        p_body: waived.remaining > 0
          ? t("api.notif.welcomeLeft", { title: listing.title as string, count: waived.remaining })
          : t("api.notif.welcomeLast", { title: listing.title as string }),
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    logAction(req, user, "listing.submit.welcome", { id, remaining: waived.remaining });
    return NextResponse.json({
      status: "pending_review",
      paidWith: "welcome",
      remaining: waived.remaining,
    });
  }

  // Reuse an actionable payment so a double-submit can't create two.
  const { data: existing } = await admin
    .from("payments")
    .select("id, amount")
    .eq("user_id", user.id)
    .eq("kind", "listing_fee")
    .in("status", ["pending", "pending_review"])
    .contains("metadata", { listing_id: id })
    .limit(1);

  let paymentId = existing?.[0]?.id as string | undefined;

  if (!paymentId) {
    // No transfer or D17 details opened in « Moyens de paiement » (D-B1): an
    // order now would have nowhere to be paid. The annonce stays as it is.
    if (!(await manualPaymentOpen(admin))) {
      return NextResponse.json(
        { error: "payment_closed", detail: (await apiTranslations(req, "payment.api"))("closed") },
        { status: 409 },
      );
    }
    const { data: created, error } = await admin
      .from("payments")
      .insert({
        user_id: user.id,
        kind: "listing_fee",
        provider: "bank_transfer",
        amount: fee.price,
        status: "pending",
        metadata: {
          listing_id: id,
          product_id: fee.id,
          product_slug: fee.slug,
          duration_days: fee.durationDays,
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
    .update({ status: "pending_payment", fee_payment_id: paymentId, rejection_reason: null })
    .eq("id", id);

  logAction(req, user, "listing.submit.payment", { id, paymentId, amount: fee.price });
  return NextResponse.json({
    status: "pending_payment",
    paidWith: "payment",
    paymentId,
    amount: fee.price,
  });
}

/** A listing status as the seller reads it; the raw code when there is no word for it. */
function statusWord(t: (key: string) => string, status: string): string {
  const known = ["draft", "pending_payment", "pending_review", "published", "rejected", "expired", "archived", "sold"];
  return known.includes(status) ? t(`status.${status}`) : status;
}
