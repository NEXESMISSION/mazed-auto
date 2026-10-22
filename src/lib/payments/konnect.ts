/**
 * Konnect (konnect.network) — the online payment provider, behind a switch.
 *
 * OFF unless KONNECT_API_KEY and KONNECT_WALLET_ID are set: until then every
 * order goes through the manual receipt flow that already exists, and nothing
 * here is ever called. Turning it on is two environment variables, once the
 * merchant account exists (D-P2).
 *
 * THE RULE THAT MATTERS. Nothing is activated because a browser came back to
 * a « success » URL, nor because a webhook said so. The webhook only carries a
 * payment reference; we then ASK Konnect for that payment
 * (GET /payments/:ref) and `verifyKonnectPayment` checks, against our own
 * order, that it is completed, in TND, for our order id, for at least the
 * amount we asked. Only then does `confirm_payment()` (0191) capture it — and
 * that capture opens at most one period, however many times this runs
 * (recettes 5 and 6).
 *
 * Amounts: Konnect counts TND in MILLIMES; our tables in dinars. The
 * conversion happens only here, at the boundary.
 */

export type KonnectConfig = { apiKey: string; walletId: string; baseUrl: string };

export function konnectConfig(): KonnectConfig | null {
  const apiKey = process.env.KONNECT_API_KEY?.trim();
  const walletId = process.env.KONNECT_WALLET_ID?.trim();
  if (!apiKey || !walletId) return null;
  const baseUrl = (process.env.KONNECT_API_URL?.trim() || "https://api.konnect.network/api/v2").replace(/\/$/, "");
  return { apiKey, walletId, baseUrl };
}

export const toMillimes = (tnd: number): number => Math.round(tnd * 1000);

export async function konnectInitPayment(
  cfg: KonnectConfig,
  o: {
    amountTnd: number;
    orderId: string;
    description: string;
    webhookUrl: string;
    successUrl: string;
    failUrl: string;
  },
): Promise<{ payUrl: string; paymentRef: string }> {
  const res = await fetch(`${cfg.baseUrl}/payments/init-payment`, {
    method: "POST",
    headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      receiverWalletId: cfg.walletId,
      token: "TND",
      amount: toMillimes(o.amountTnd),
      type: "immediate",
      description: o.description.slice(0, 280),
      acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
      lifespan: 30,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      orderId: o.orderId,
      webhook: o.webhookUrl,
      // Konnect calls the webhook server to server; the buyer lands on our
      // return page, which shows the state and asks for a check — it never
      // activates anything by itself.
      silentWebhook: true,
      successUrl: o.successUrl,
      failUrl: o.failUrl,
      theme: "dark",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { payUrl?: string; paymentRef?: string };
  if (!res.ok || !j.payUrl || !j.paymentRef) {
    throw new Error(`konnect init-payment failed (${res.status})`);
  }
  return { payUrl: j.payUrl, paymentRef: j.paymentRef };
}

/** Konnect's own record of a payment, as returned by GET /payments/:ref. */
export async function konnectGetPayment(cfg: KonnectConfig, paymentRef: string): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/payments/${encodeURIComponent(paymentRef)}`, {
    headers: { "x-api-key": cfg.apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`konnect get-payment failed (${res.status})`);
  const j = (await res.json().catch(() => null)) as { payment?: unknown } | null;
  return j?.payment ?? j;
}

export type KonnectVerdict = {
  outcome: "completed" | "pending" | "mismatch";
  reason?: string;
  /** What Konnect said, kept on the payment and in payment_events. */
  snapshot: Record<string, unknown>;
};

/**
 * Does Konnect's record prove THIS order was paid in full? Pure, so every rule
 * is tested. `pending` covers « not paid yet » and « failed »: Konnect itself
 * says to trust the payment status, not individual transactions.
 */
export function verifyKonnectPayment(
  raw: unknown,
  expected: { orderId: string; amountTnd: number },
): KonnectVerdict {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const snapshot = {
    status: p.status ?? null,
    amount: p.amount ?? null,
    reachedAmount: p.reachedAmount ?? null,
    token: p.token ?? null,
    orderId: p.orderId ?? null,
    id: p.id ?? p._id ?? null,
  };

  if (p.orderId !== undefined && p.orderId !== expected.orderId) {
    return { outcome: "mismatch", reason: "order_id", snapshot };
  }
  if (p.status !== "completed") return { outcome: "pending", snapshot };
  if (p.orderId === undefined) return { outcome: "mismatch", reason: "order_id_missing", snapshot };
  if (p.token !== undefined && p.token !== "TND") {
    return { outcome: "mismatch", reason: "currency", snapshot };
  }
  const paid = Number(p.reachedAmount ?? p.amount);
  if (!Number.isFinite(paid) || paid < toMillimes(expected.amountTnd)) {
    return { outcome: "mismatch", reason: "amount", snapshot };
  }
  return { outcome: "completed", snapshot };
}
