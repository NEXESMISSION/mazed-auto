// Konnect.network payment webhook.
//
// Konnect calls this endpoint with `?payment_ref=<ref>` once a payment
// reaches a terminal state. Konnect's webhook is unsigned — it's a
// "go check this id" notification, not a trusted payload — so we MUST
// re-fetch the payment from Konnect with our API key before activating
// anything.
//
// The endpoint accepts both GET (Konnect's default) and POST so it's
// resilient to either format.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getKonnectPaymentStatus } from "@/lib/payments/konnect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(paymentRef: string | null) {
  if (!paymentRef) {
    return NextResponse.json(
      { ok: false, error: "missing payment_ref" },
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

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("payment_ref");
  return handle(ref);
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
  return handle(ref);
}
