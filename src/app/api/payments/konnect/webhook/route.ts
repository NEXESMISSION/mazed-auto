// Konnect.network payment webhook.
//
// Konnect calls this endpoint with `?payment_ref=<ref>` once a payment
// reaches a terminal state. Konnect's webhook is unsigned — it's a
// "go check this id" notification, not a trusted payload — so we MUST
// re-fetch the payment from Konnect with our API key before activating
// anything. That alone makes the "completed" branch un-spoofable: an
// attacker can flood us with bogus payment_refs, but `complete_*` only
// runs when Konnect's own API confirms `status: "completed"`.
//
// Defense in depth, in order of importance:
//   1. Re-fetch from Konnect (already in place). Foundational.
//   2. Optional shared secret. If `KONNECT_WEBHOOK_SECRET` is set in
//      env, the request must include `?token=<secret>` (or
//      `x-konnect-token` header) for any handler work to happen. This
//      lets ops add a quick gate without needing Konnect-side feature
//      support, since Konnect itself doesn't sign webhooks today.
//   3. Format-validate the `payment_ref` — Konnect refs are ~24-char
//      hex, anything outside that shape is rejected without touching
//      the Konnect API (saves us from SSRF-via-control-chars and
//      cheaper per-RPS budget burn).
//   4. Idempotency lives in the SQL layer: `complete_subscription_from_payment`
//      is a no-op if the subscription is already active, and
//      `fail_pending_subscription` is a no-op past the pending state.
//      Replay-safe.
//
// The endpoint accepts both GET (Konnect's default) and POST so it's
// resilient to either format.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getKonnectPaymentStatus } from "@/lib/payments/konnect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Konnect's documented payment ref shape is a 24-character lowercase
// hex string. We allow any [a-f0-9]{16,64} as a defensive widening in
// case Konnect later adopts a longer format — but anything outside hex
// is a forged request. Tight enough to reject `../../../`, control
// chars, and SSRF payloads.
const PAYMENT_REF_SHAPE = /^[a-f0-9]{16,64}$/i;

/**
 * Constant-time string compare. `a === b` short-circuits on the first
 * mismatched character, which leaks the shared-secret length and
 * approximate prefix via timing. The webhook is low-traffic so the
 * crypto cost is irrelevant; correctness matters.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function handle(
  paymentRef: string | null,
  presentedToken: string | null,
) {
  // If a webhook secret is configured, require it. When absent we
  // intentionally keep the route open — the Konnect API-key re-check
  // is the primary defense, and ops shouldn't be forced into a config
  // change to unbreak the system if the secret rotates.
  const required = process.env.KONNECT_WEBHOOK_SECRET;
  if (required) {
    if (!presentedToken || !timingSafeEqual(presentedToken, required)) {
      // Generic 401 — no information about whether the route exists,
      // the secret format, or how close they got. Attackers see the
      // same response for "missing token" and "wrong token".
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  if (!paymentRef) {
    return NextResponse.json(
      { ok: false, error: "missing payment_ref" },
      { status: 400 },
    );
  }
  if (!PAYMENT_REF_SHAPE.test(paymentRef)) {
    // Reject obviously-bogus refs before they cost us a Konnect API
    // call. A real payment_ref always matches; failed-match means
    // either a typo, a probe, or a forged request.
    return NextResponse.json(
      { ok: false, error: "invalid payment_ref" },
      { status: 400 },
    );
  }

  // Use the service-role client so we can update user_subscriptions
  // without the original user's session (the webhook is anonymous).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "supabase service config missing" },
      { status: 500 },
    );
  }
  const supa = createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the payment status by calling Konnect directly with our key.
  let payment;
  try {
    payment = await getKonnectPaymentStatus(paymentRef);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "konnect verify failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  // Match the payment back to our subscription row. We stored the
  // subscription id as Konnect's `orderId`, but also save the
  // payment_provider_ref for redundancy — try both.
  const candidates: string[] = [];
  if (payment.orderId) candidates.push(payment.orderId);
  candidates.push(payment.paymentRef);

  let subId: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    const { data: byId } = await supa
      .from("user_subscriptions")
      .select("id")
      .eq("id", c)
      .maybeSingle();
    if (byId?.id) {
      subId = byId.id;
      break;
    }
    const { data: byRef } = await supa
      .from("user_subscriptions")
      .select("id")
      .eq("payment_provider_ref", c)
      .maybeSingle();
    if (byRef?.id) {
      subId = byRef.id;
      break;
    }
  }

  if (!subId) {
    return NextResponse.json(
      { ok: false, error: "subscription not found for this payment" },
      { status: 404 },
    );
  }

  // Konnect statuses: completed | pending | failed | refunded | canceled | expired | unknown.
  if (payment.status === "completed") {
    const { error } = await supa.rpc("complete_subscription_from_payment", {
      p_subscription_id: subId,
      p_provider_ref: payment.paymentRef,
    });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, subscription_id: subId });
  }

  if (
    payment.status === "failed" ||
    payment.status === "canceled" ||
    payment.status === "expired" ||
    payment.status === "refunded"
  ) {
    const { error } = await supa.rpc("fail_pending_subscription", {
      p_subscription_id: subId,
      p_reason: `konnect:${payment.status}`,
    });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, subscription_id: subId });
  }

  // 'pending' — leave the row alone, Konnect will call again.
  return NextResponse.json({ ok: true, status: payment.status });
}

function extractToken(request: NextRequest): string | null {
  // Accept the shared secret in either a query param (`?token=...`)
  // or a header (`x-konnect-token: ...`). Query is simpler for
  // ops-driven testing; header is preferred for production.
  return (
    request.headers.get("x-konnect-token") ??
    request.nextUrl.searchParams.get("token") ??
    null
  );
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("payment_ref");
  return handle(ref, extractToken(request));
}

export async function POST(request: NextRequest) {
  // Some Konnect setups POST instead of GET. Accept both.
  let body: { payment_ref?: string } | null = null;
  try {
    body = (await request.json()) as { payment_ref?: string };
  } catch {
    body = null;
  }
  const ref =
    body?.payment_ref ??
    request.nextUrl.searchParams.get("payment_ref") ??
    null;
  return handle(ref, extractToken(request));
}
