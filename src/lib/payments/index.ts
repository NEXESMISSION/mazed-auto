// Payment-provider abstraction. Reads `payment.active_provider` from
// platform_settings and dispatches to the right adapter.
//
// Currently supported:
//   - "simulation": no real charge — used in dev / when Konnect isn't
//     configured. Returns a redirect to the in-app return page with
//     `simulated=1`, which the page interprets as "instant success".
//   - "konnect": Tunisia's Konnect.network gateway. Real charge,
//     hosted-page redirect, server-to-server webhook callback.
//   - "clictopay": stub — STB's official gateway. Not implemented yet.

import { initKonnectPayment, type KonnectInitInput } from "./konnect";
import { getActivePaymentProvider } from "@/lib/config";

export type PaymentProviderId = "simulation" | "konnect" | "clictopay";

export interface InitPaymentInput {
  amount: number;
  description: string;
  /** Internal id we own (subscription_id). */
  orderId: string;
  /** URL Konnect / Clictopay redirects the user to after success. */
  successUrl: string;
  /** Same, on failure / cancel. */
  failUrl: string;
  /** Server-to-server webhook URL. */
  webhookUrl: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

export interface InitPaymentResult {
  /** Provider's own reference for this payment. We store it on the
   *  user_subscriptions row so the webhook can match it back. */
  providerRef: string;
  /** URL the browser should redirect to. For simulation this is our
   *  internal /payment/return page with `simulated=1`. */
  redirectUrl: string;
  /** Which provider actually handled this. Caller stamps it on the
   *  subscription row. */
  providerId: PaymentProviderId;
}

/**
 * Initiate a payment with whichever provider is active in
 * platform_settings. Server-side only (calls config which calls supabase).
 */
export async function initPaymentWithActiveProvider(
  input: InitPaymentInput,
): Promise<InitPaymentResult> {
  const provider = (await getActivePaymentProvider()) as PaymentProviderId;

  if (provider === "konnect") {
    const r = await initKonnectPayment(input as KonnectInitInput);
    return {
      providerRef: r.paymentRef,
      redirectUrl: r.payUrl,
      providerId: "konnect",
    };
  }

  if (provider === "clictopay") {
    // TODO: implement Clictopay (STB). Until then, fall back so
    // toggling the setting doesn't break the flow.
    throw new Error(
      "Clictopay provider isn't implemented yet — set payment.active_provider to 'simulation' or 'konnect'.",
    );
  }

  // Default: simulation. Route through the in-app fake-card checkout
  // so the user gets the full UX (card form, processing spinner,
  // success animation). The successUrl we pass to that page becomes
  // the activation redirect once the simulated payment "completes".
  //
  // successUrl is already prefixed with the locale (e.g.
  // /fr/payment/return?sub=…), so we swap the segment after the
  // locale to land on /payment/checkout instead.
  const checkoutUrl = buildSimulatedCheckoutUrl(input);
  return {
    providerRef: `SIM-${input.orderId.slice(0, 8)}-${Date.now()}`,
    redirectUrl: checkoutUrl,
    providerId: "simulation",
  };
}

function buildSimulatedCheckoutUrl(input: InitPaymentInput): string {
  // input.successUrl looks like: https://host/{locale}/payment/return?sub=…
  // We rebuild as:               https://host/{locale}/payment/checkout?type=subscription&sub=…&amount=…&plan=…
  let origin: string;
  let pathParts: string[];
  try {
    const u = new URL(input.successUrl);
    origin = u.origin;
    pathParts = u.pathname.split("/").filter(Boolean);
  } catch {
    return input.successUrl;
  }
  const locale = pathParts[0] || "fr";
  const checkout = new URL(`${origin}/${locale}/payment/checkout`);
  checkout.searchParams.set("type", "subscription");
  checkout.searchParams.set("sub", input.orderId);
  checkout.searchParams.set("amount", String(input.amount));
  checkout.searchParams.set("plan_label", input.description);
  return checkout.toString();
}
