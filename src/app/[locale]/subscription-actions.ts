"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { initPaymentWithActiveProvider } from "@/lib/payments";

type Result<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Build an absolute URL based on the incoming request headers, used
 *  for return / webhook URLs we hand to the payment provider. */
async function getSiteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Self-serve subscribe / change-plan. Creates a pending subscription
 * row, calls the active payment provider for a payment intent, and
 * returns the URL the browser should redirect to.
 *
 * Flow:
 *   1. RPC `initiate_pending_subscription` creates a row in
 *      pending_payment status (does NOT touch existing entitlements).
 *   2. We resolve the active provider (admin-tunable via
 *      platform_settings → payment.active_provider).
 *   3. The provider returns either a real hosted-page URL (Konnect)
 *      or our internal /payment/return?simulated=1 URL.
 *   4. Browser redirects. The webhook (or the return page in
 *      simulation mode) eventually calls
 *      `complete_subscription_from_payment` which activates the row
 *      and expires any prior entitlement.
 */
export async function initiateSubscriptionPaymentAction(input: {
  planSlug: string;
  locale?: string;
}): Promise<Result<{ redirectUrl: string; subscriptionId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  // Look up the plan price so we can hand it to the provider AND
  // store it on the pending row for audit.
  const { data: planRow, error: planErr } = await supabase
    .from("cms_subscription_plans")
    .select("slug, name_fr, monthly_price")
    .eq("slug", input.planSlug)
    .eq("is_visible", true)
    .maybeSingle();
  if (planErr) return { ok: false, error: planErr.message };
  if (!planRow) return { ok: false, error: "PLAN_NOT_FOUND" };

  // Read which provider we'll use — same value the abstraction will
  // re-read, but we need it here to stamp the pending row.
  const { data: providerRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "payment.active_provider")
    .maybeSingle();
  const provider = (providerRow?.value as string | null) ?? "simulation";

  // 1. Create the pending row.
  const { data: subId, error: subErr } = await supabase.rpc(
    "initiate_pending_subscription",
    {
      p_plan_slug: input.planSlug,
      p_provider: provider,
      p_amount: planRow.monthly_price,
    },
  );
  if (subErr) return { ok: false, error: subErr.message };
  const subscriptionId = subId as string;

  // 2. Build provider URLs.
  const origin = await getSiteOrigin();
  const locale = input.locale || "fr";
  const successUrl = `${origin}/${locale}/payment/return?sub=${subscriptionId}`;
  const failUrl = `${origin}/${locale}/payment/return?sub=${subscriptionId}&failed=1`;
  const webhookUrl = `${origin}/api/payments/konnect/webhook`;

  // Pre-fill provider form with what we know about the user.
  const meta = (user.user_metadata ?? {}) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };

  // 3. Initiate payment with the active provider.
  let providerResult;
  try {
    providerResult = await initPaymentWithActiveProvider({
      amount: Number(planRow.monthly_price),
      description: `Abonnement Mazed Auto — ${planRow.name_fr}`,
      orderId: subscriptionId,
      successUrl,
      failUrl,
      webhookUrl,
      firstName: meta.firstName,
      lastName: meta.lastName,
      email: user.email ?? undefined,
      phoneNumber: meta.phone,
    });
  } catch (e) {
    // Roll back the pending row so the user can retry without
    // dangling intents.
    await supabase.rpc("fail_pending_subscription", {
      p_subscription_id: subscriptionId,
      p_reason: `provider_init_failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Échec de l'initialisation du paiement",
    };
  }

  // 4. Stamp the provider ref on the row so the webhook can match it back.
  await supabase
    .from("user_subscriptions")
    .update({
      payment_provider: providerResult.providerId,
      payment_provider_ref: providerResult.providerRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  revalidatePath(`/[locale]/pricing`, "page");
  return {
    ok: true,
    data: {
      redirectUrl: providerResult.redirectUrl,
      subscriptionId,
    },
  };
}

/**
 * Self-serve cancel for the signed-in user. The RPC keeps the perks
 * until current_period_end, doesn't refund, and notifies the user.
 */
export async function cancelMySubscriptionAction(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };
  const { error } = await supabase.rpc("cancel_my_subscription");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/pricing`, "page");
  revalidatePath(`/[locale]/profile`, "page");
  revalidatePath(`/[locale]/profile/subscription`, "page");
  return { ok: true };
}

// ----- LEGACY ALIAS -----
// /pricing's SubscribeButton imports `subscribeToPlanAction`. Keep
// the old name as a thin wrapper so callers don't need to change all
// at once.
export async function subscribeToPlanAction(input: {
  planSlug: string;
  locale?: string;
}) {
  return initiateSubscriptionPaymentAction(input);
}
