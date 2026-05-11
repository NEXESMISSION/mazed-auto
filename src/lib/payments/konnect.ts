// Konnect.network payment-provider adapter.
//
// Konnect is the most popular online-payment gateway in Tunisia. We
// use the v2 REST API. Two operations:
//
//   1. initPayment: server-to-server POST to create a hosted-payment
//      session. Konnect returns { paymentRef, payUrl }. We redirect
//      the user to payUrl.
//   2. getPayment: server-to-server GET that returns the full payment
//      object including status. We call this from the webhook to
//      verify what Konnect sends us.
//
// Env vars (set in `.env.local` for dev, in your hosting provider for prod):
//   KONNECT_API_KEY      — your sandbox or production API key
//   KONNECT_WALLET_ID    — your Konnect wallet (receiver) id
//   KONNECT_API_URL      — defaults to https://api.preprod.konnect.network
//                          set to https://api.konnect.network for prod
//
// Docs: https://docs.konnect.network/

const DEFAULT_API_URL = "https://api.preprod.konnect.network";

export interface KonnectInitInput {
  /** Amount in DT (we convert to millimes for Konnect). */
  amount: number;
  /** Free-text description shown on Konnect's hosted page. */
  description: string;
  /** Our internal id (subscription_id). Echoed back via webhook. */
  orderId: string;
  /** URLs Konnect redirects the buyer to. */
  successUrl: string;
  failUrl: string;
  /** Server-to-server callback URL. */
  webhookUrl: string;
  /** Pre-fill the form. */
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Tunisian phone in E.164, e.g. +21620123456. */
  phoneNumber?: string;
}

export interface KonnectInitResult {
  paymentRef: string;
  payUrl: string;
}

export interface KonnectPaymentStatus {
  paymentRef: string;
  /** Konnect payment status — "completed" / "pending" / "failed" /
   *  "refunded" / "canceled" / "expired" — kept as string for forward-
   *  compatibility. */
  status: string;
  amount: number;
  orderId: string | null;
}

/** Read env config and assert minimum requirements. */
function getKonnectConfig() {
  const apiKey = process.env.KONNECT_API_KEY;
  const walletId = process.env.KONNECT_WALLET_ID;
  const apiUrl = process.env.KONNECT_API_URL || DEFAULT_API_URL;
  if (!apiKey || !walletId) {
    throw new Error(
      "KONNECT_API_KEY and KONNECT_WALLET_ID must be set to use the Konnect provider.",
    );
  }
  return { apiKey, walletId, apiUrl };
}

/**
 * Create a Konnect hosted-payment session. Server-side only.
 * Throws if the API key is missing or Konnect rejects the request.
 */
export async function initKonnectPayment(
  input: KonnectInitInput,
): Promise<KonnectInitResult> {
  const { apiKey, walletId, apiUrl } = getKonnectConfig();

  // Konnect amounts are in millimes (1 DT = 1000 millimes).
  const amountMillimes = Math.round(input.amount * 1000);

  const body = {
    receiverWalletId: walletId,
    token: "TND",
    amount: amountMillimes,
    type: "immediate",
    description: input.description,
    lifespan: 30, // minutes
    checkoutForm: false,
    addPaymentFeesToAmount: true,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    phoneNumber: (input.phoneNumber ?? "").replace(/\D/g, "").slice(-8),
    email: input.email ?? "",
    orderId: input.orderId,
    webhook: input.webhookUrl,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    theme: "dark",
    acceptedPaymentMethods: ["bank_card", "wallet", "e-DINAR"],
  };

  const res = await fetch(`${apiUrl}/api/v2/payments/init-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Konnect init-payment failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    payUrl?: string;
    paymentRef?: string;
  };
  if (!data.payUrl || !data.paymentRef) {
    throw new Error("Konnect init-payment returned an unexpected payload.");
  }
  return { paymentRef: data.paymentRef, payUrl: data.payUrl };
}

/**
 * Read the current status of a Konnect payment. Webhook handlers MUST
 * call this rather than trusting the webhook body — Konnect's webhook
 * is just a "go check this id" notification, not a signed event.
 */
export async function getKonnectPaymentStatus(
  paymentRef: string,
): Promise<KonnectPaymentStatus> {
  const { apiKey, apiUrl } = getKonnectConfig();
  const res = await fetch(`${apiUrl}/api/v2/payments/${paymentRef}`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Konnect get-payment failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    payment?: {
      id?: string;
      status?: string;
      amount?: number;
      orderId?: string | null;
    };
  };
  const p = data.payment ?? {};
  return {
    paymentRef: p.id ?? paymentRef,
    status: p.status ?? "unknown",
    amount: typeof p.amount === "number" ? p.amount / 1000 : 0,
    orderId: p.orderId ?? null,
  };
}
