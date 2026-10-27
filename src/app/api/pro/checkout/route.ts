import { NextRequest, NextResponse } from "next/server";
import { apiTranslations, localeFromRequest } from "@/i18n/api";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { overLimit, tooMany } from "@/lib/http/rateLimit";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { CAN_EDIT_SHOP, memberRole } from "@/lib/shops/server";
import { konnectInitPayment } from "@/lib/payments/konnect";
import { konnectForCheckout } from "@/lib/payments/konnectAccount";
import { manualPaymentOpen } from "@/lib/payments";
import { formatDate } from "@/lib/dates";
import { quoteFor, resolveIntent, subscriptionError, type Intent, type Quote } from "@/lib/shops/subscription";

/**
 * POST /api/pro/checkout — order a plan for a shop, or a 7-day boost for an
 * annonce, and say where to pay it.
 *
 *   { shop_id, plan_code, intent? }   → the shop's subscription: subscribe,
 *                                       renew or upgrade it (0198)
 *   { listing_id, product: "boost-7j" } → a boost
 *   (+ provider: "manual" to pay by transfer even when Konnect is on)
 *
 * THE PRICE IS READ HERE, from `products`, never from the request (brief). It
 * is written on the order as `expected_amount`, which the capture checks again
 * (0191). An order still open for the same thing is reused rather than
 * duplicated.
 *
 * WHERE TO PAY. Konnect when the back office has switched it on (D-B2; in
 * test mode, for admins only): the order gets Konnect's reference and the
 * buyer is sent to its page; nothing is activated until the webhook or the
 * return page has asked Konnect and it says « completed ».
 * Otherwise the existing transfer / D17 page, where the buyer uploads a
 * receipt and an admin captures it.
 *
 * ONE SUBSCRIPTION (0198). A shop never buys a second subscription beside
 * its own: a plan button is a subscription (none yet), its renewal (same
 * plan, or the lower one scheduled) or an upgrade (prorated, now). The
 * database prices it and places the order (`create_subscription_order`),
 * under a lock on the shop: two clicks find one order, and an order for
 * something else while one is open is refused. Downgrades and cancellations
 * are not bought — /api/pro/subscription schedules them.
 *
 * APPROVAL FIRST (0196). When the back office wants to approve this kind of
 * purchase (an opening, a plan change… `pro_approvals`), there is no order
 * until an admin has said yes: the click files a request instead, answered
 * `{ requested: true }`, and the same click after the yes is the order. The
 * database refuses a payment row without that yes, whatever this route does.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);
  const suspended = await refuseIfSuspended(admin, user.id);
  if (suspended) return suspended;
  if (await overLimit(admin, `checkout:${user.id}`, 20, 3600)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as {
    shop_id?: unknown; plan_code?: unknown; listing_id?: unknown; product?: unknown; provider?: unknown; intent?: unknown;
  };

  let kind: "subscription" | "promo";
  let shopId: string | null = null;
  let shopStatus: string | null = null;
  let listingId: string | null = null;
  type Offer = { id: string; slug: string; price: number; name_fr: string; plan_code: string | null };
  let product: Offer | null = null;

  if (typeof body.plan_code === "string" && typeof body.shop_id === "string") {
    kind = "subscription";
    shopId = body.shop_id;
    const role = /^[0-9a-f-]{36}$/i.test(shopId) ? await memberRole(admin, user.id, shopId) : null;
    if (!role || !CAN_EDIT_SHOP.includes(role)) {
      return NextResponse.json({ error: "not_shop_member", detail: (await apiTranslations(req, "pro.api"))("notShopMember") }, { status: 403 });
    }
    const { data: shop } = await admin.from("shops").select("status").eq("id", shopId).maybeSingle();
    // A refused shop may still ask to open again — that is decided below.
    if (!shop || ["suspended", "closed"].includes(shop.status as string)) {
      return NextResponse.json({ error: "shop_not_allowed", detail: (await apiTranslations(req, "pro.api"))("shopNotAllowed") }, { status: 409 });
    }
    shopStatus = shop.status as string;
    const { data } = await admin
      .from("products")
      .select("id, slug, price, name_fr, plan_code")
      .eq("plan_code", body.plan_code)
      .eq("kind", "subscription")
      .eq("is_active", true)
      .maybeSingle();
    product = (data as Offer | null) ?? null;
  } else if (body.product === "boost-7j" && typeof body.listing_id === "string") {
    kind = "promo";
    listingId = body.listing_id;
    const { data: listing } = await admin
      .from("listings")
      .select("id, seller_id, shop_id, status")
      .eq("id", listingId)
      .maybeSingle();
    if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    let allowed = listing.seller_id === user.id;
    if (!allowed && listing.shop_id) {
      const role = await memberRole(admin, user.id, listing.shop_id as string);
      allowed = role !== null && CAN_EDIT_SHOP.includes(role);
    }
    if (!allowed) return NextResponse.json({ error: "not_owner" }, { status: 403 });
    if (listing.status !== "published") {
      return NextResponse.json({ error: "not_published", detail: (await apiTranslations(req, "pro.api"))("notPublished") }, { status: 409 });
    }
    shopId = (listing.shop_id as string | null) ?? null;
    // A shop boosts while a period is running — not in grace (brief, 0192).
    if (shopId) {
      const nowIso = new Date().toISOString();
      const { data: period } = await admin
        .from("subscriptions")
        .select("id")
        .eq("shop_id", shopId)
        .in("status", ["active", "grace"])
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .limit(1);
      if (!period?.length) {
        return NextResponse.json(
          { error: "no_current_period", detail: (await apiTranslations(req, "pro.api"))("noCurrentPeriod") },
          { status: 409 },
        );
      }
    }
    const { data } = await admin
      .from("products")
      .select("id, slug, price, name_fr, plan_code")
      .eq("slug", "boost-7j")
      .eq("is_active", true)
      .maybeSingle();
    product = (data as Offer | null) ?? null;
  } else {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!product) {
    return NextResponse.json(
      { error: "not_for_sale", detail: (await apiTranslations(req, "pro.api"))("notForSale") },
      { status: 409 },
    );
  }

  // ── What this is for the shop's one subscription (0198) ─────────────────
  // Checked before an approval is asked for: nobody files a request for
  // something that could not be paid afterwards.
  let intent: Intent | null = null;
  let quote: Quote | null = null;
  if (kind === "subscription" && shopId) {
    intent = await resolveIntent(admin, shopId, product.id, body.intent);
    quote = await quoteFor(admin, shopId, product.id, intent);
    if (quote.error) return refusal(req, quote.error, quote);
  }

  // ── The approval (0196) ──────────────────────────────────────────────────
  let requestId: string | null = null;
  if (shopId) {
    const { data: reqKind } = await admin.rpc("pro_request_kind", { p_shop: shopId, p_product: product.id });
    let open = admin
      .from("pro_requests")
      .select("id, status, product_id")
      .eq("shop_id", shopId)
      .in("status", ["pending", "approved"]);
    open = reqKind === "boost" ? open.eq("kind", "boost").eq("listing_id", listingId ?? "") : open.neq("kind", "boost");
    const { data: openReq } = reqKind ? await open.maybeSingle() : { data: null };
    const need = reqKind ? (await admin.rpc("pro_approval_required", { p_kind: reqKind })).data === true : false;

    if (shopStatus === "rejected" && !(need && reqKind === "opening")) {
      return NextResponse.json({ error: "shop_not_allowed", detail: (await apiTranslations(req, "pro.api"))("shopNotAllowed") }, { status: 409 });
    }
    if (openReq?.status === "approved" && openReq.product_id === product.id) {
      // The yes this click was waiting for: the order carries it.
      requestId = openReq.id as string;
    } else if (need) {
      const t = await apiTranslations(req, "pro.api");
      if (openReq) {
        return NextResponse.json(
          openReq.status === "pending"
            ? { error: "request_pending", detail: t("requestPending") }
            : { error: "request_approved_other", detail: t("requestApprovedOther") },
          { status: 409 },
        );
      }
      const { data: filed, error: reqErr } = await admin
        .from("pro_requests")
        .insert({ shop_id: shopId, product_id: product.id, requested_by: user.id, kind: reqKind, listing_id: listingId })
        .select("id, kind")
        .single();
      if (reqErr || !filed) {
        if (reqErr?.code === "23505") {
          return NextResponse.json({ error: "request_pending", detail: t("requestPending") }, { status: 409 });
        }
        const known = ["shop_not_allowed", "not_published", "not_for_sale"].find((c) => reqErr?.message.includes(c));
        if (known) {
          const word = { shop_not_allowed: "shopNotAllowed", not_published: "notPublished", not_for_sale: "notForSale" }[known]!;
          return NextResponse.json({ error: known, detail: t(word) }, { status: 409 });
        }
        return fail("request_create_failed", 500, reqErr);
      }
      logAction(req, user, `pro.request.${filed.kind as string}`, { requestId: filed.id, shopId, listingId });
      return NextResponse.json({
        requested: true,
        requestId: filed.id,
        kind: filed.kind,
        message: t(`requested.${filed.kind as string}`),
      });
    }
  }

  const cfg = body.provider === "manual" ? null : await konnectForCheckout(admin, user.id);
  const provider = cfg ? "konnect" : "bank_transfer";
  // Without Konnect the order is paid by transfer or D17: not before the back
  // office has opened one of them with real details (D-B1).
  if (!cfg && !(await manualPaymentOpen(admin))) {
    return NextResponse.json(
      { error: "payment_closed", detail: (await apiTranslations(req, "payment.api"))("closed") },
      { status: 409 },
    );
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, "");

  // ── The order ────────────────────────────────────────────────────────────
  let paymentId: string;
  let amount: number;
  let metadata: Record<string, unknown>;
  if (kind === "subscription" && shopId && intent) {
    const { data: placed, error: orderErr } = await admin.rpc("create_subscription_order", {
      p_shop: shopId, p_user: user.id, p_product: product.id, p_intent: intent, p_provider: provider, p_request: requestId,
    });
    if (orderErr) {
      if (orderErr.message.includes("approval_required")) {
        return NextResponse.json(
          { error: "approval_required", detail: (await apiTranslations(req, "pro.api"))("approvalRequired") },
          { status: 409 },
        );
      }
      const known = subscriptionError(orderErr.message);
      if (known) return refusal(req, known, quote ?? {});
      return fail("payment_create_failed", 500, orderErr);
    }
    const o = placed as { payment_id: string; amount: number; reused: boolean; pay_url?: string | null };
    if (o.reused) {
      // The same order, clicked again: back to where it is paid. An online
      // order whose Konnect link the first click is still creating has no
      // page yet — that click is the one that will get there.
      if (provider === "konnect" && !o.pay_url) {
        return NextResponse.json({ error: "order_starting", detail: (await apiTranslations(req, "pro.api"))("orderStarting") }, { status: 409 });
      }
      const redirect = provider === "konnect" ? o.pay_url! : `/payment/checkout?payment=${o.payment_id}`;
      return NextResponse.json({ paymentId: o.payment_id, provider, redirect, reused: true });
    }
    paymentId = o.payment_id;
    amount = Number(o.amount);
    const { data: row } = await admin.from("payments").select("metadata").eq("id", paymentId).single();
    metadata = (row?.metadata ?? {}) as Record<string, unknown>;
  } else {
    // A boost: an order already open for the same thing is the order.
    let q = admin
      .from("payments")
      .select("id, provider, status, metadata")
      .eq("user_id", user.id)
      .eq("kind", kind)
      .in("status", ["pending", "pending_review"])
      .eq("provider", provider)
      .contains("metadata", { product_id: product.id, ...(listingId ? { listing_id: listingId } : {}) })
      .gte("created_at", new Date(Date.now() - 2 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (shopId) q = q.eq("shop_id", shopId);
    const { data: open } = await q;
    const reuse = open?.[0] as { id: string; provider: string; metadata: { pay_url?: string } } | undefined;
    if (reuse) {
      const redirect = reuse.provider === "konnect" && reuse.metadata?.pay_url
        ? reuse.metadata.pay_url
        : `/payment/checkout?payment=${reuse.id}`;
      return NextResponse.json({ paymentId: reuse.id, provider: reuse.provider, redirect, reused: true });
    }

    metadata = {
      product_id: product.id,
      product_slug: product.slug,
      plan_code: product.plan_code,
      expected_amount: Number(product.price),
      ...(listingId ? { listing_id: listingId } : {}),
      ...(requestId ? { request_id: requestId } : {}),
      initiated_at: new Date().toISOString(),
    };
    const { data: pay, error } = await admin
      .from("payments")
      .insert({ user_id: user.id, kind, provider, amount: product.price, status: "pending", shop_id: shopId, metadata })
      .select("id")
      .single();
    if (error?.message.includes("approval_required")) {
      // The setting changed between the check above and the order.
      return NextResponse.json(
        { error: "approval_required", detail: (await apiTranslations(req, "pro.api"))("approvalRequired") },
        { status: 409 },
      );
    }
    if (error || !pay) return fail("payment_create_failed", 500, error);
    paymentId = pay.id as string;
    amount = Number(product.price);
  }

  if (!cfg) {
    logAction(req, user, `checkout.${kind}`, { paymentId, provider, shopId, intent });
    return NextResponse.json({ paymentId, provider, redirect: `/payment/checkout?payment=${paymentId}` });
  }

  try {
    // Back where the buyer can see the answer: the shop's subscription page,
    // or a private seller's annonces.
    const back = shopId
      ? `${site}/fr/pro/dashboard/abonnement?payment=${paymentId}`
      : `${site}/fr/account/listings?payment=${paymentId}`;
    const { payUrl, paymentRef } = await konnectInitPayment(cfg, {
      // What the order says — for an upgrade, the prorated difference.
      amountTnd: amount,
      orderId: paymentId,
      description: kind !== "subscription"
        ? "Mazed Auto — boost 7 jours"
        : intent === "upgrade"
          ? `Mazed Auto — passage à la formule ${product.name_fr}`
          : `Mazed Auto — formule ${product.name_fr}`,
      webhookUrl: `${site}/api/payments/konnect/webhook`,
      successUrl: back,
      failUrl: back,
    });
    await admin
      .from("payments")
      .update({ provider_ref: paymentRef, metadata: { ...metadata, pay_url: payUrl } })
      .eq("id", paymentId);
    logAction(req, user, `checkout.${kind}`, { paymentId, provider, shopId, intent });
    return NextResponse.json({ paymentId, provider, redirect: payUrl });
  } catch (e) {
    await admin
      .from("payments")
      .update({ status: "failed", admin_notes: "Konnect indisponible à la création" })
      .eq("id", paymentId);
    return fail("konnect_unavailable", 502, e);
  }
}

/** A purchase the shop's subscription does not allow, said in the reader's language. */
async function refusal(req: NextRequest, code: string, quote: Quote) {
  const t = await apiTranslations(req, "pro.api.subscription");
  const known = subscriptionError(code) ?? "bad_intent";
  const date = quote.opens_at ? formatDate(quote.opens_at, localeFromRequest(req)) : "";
  return NextResponse.json({ error: known, detail: t(known, { date }) }, { status: 409 });
}
