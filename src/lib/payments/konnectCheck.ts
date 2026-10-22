import type { SupabaseClient } from "@supabase/supabase-js";
import { konnectConfig, konnectGetPayment, verifyKonnectPayment } from "@/lib/payments/konnect";
import { log } from "@/lib/log";

export type CheckOutcome =
  | "captured"
  | "already_captured"
  | "not_capturable"
  | "pending"
  | "mismatch"
  | "unknown_payment"
  | "not_configured"
  | "error";

/**
 * Ask Konnect about one of our payments and capture it if — and only if — its
 * own record proves it was paid in full. The one path shared by the webhook,
 * the buyer's return page and the reconciliation job, so all three decide the
 * same way. Every look is written to `payment_events` (0188), whatever the
 * answer, which is what reconciliation and an admin read afterwards.
 */
export async function checkKonnectPayment(
  admin: SupabaseClient,
  payment: { id: string; amount: number | string; provider_ref: string | null; status: string },
  source: "webhook" | "return" | "reconcile",
): Promise<CheckOutcome> {
  if (payment.status === "captured") return "already_captured";
  const cfg = konnectConfig();
  if (!cfg || !payment.provider_ref) return "not_configured";

  let raw: unknown;
  try {
    raw = await konnectGetPayment(cfg, payment.provider_ref);
  } catch (e) {
    log.scope("payments").warn(`konnect lookup failed for ${payment.id}: ${(e as Error).message}`);
    await admin.from("payment_events").insert({
      payment_id: payment.id, provider: "konnect", provider_ref: payment.provider_ref,
      source, outcome: "error",
    });
    return "error";
  }

  const verdict = verifyKonnectPayment(raw, { orderId: payment.id, amountTnd: Number(payment.amount) });
  if (verdict.outcome !== "completed") {
    await admin.from("payment_events").insert({
      payment_id: payment.id, provider: "konnect", provider_ref: payment.provider_ref, source,
      verified: verdict.snapshot,
      outcome: verdict.outcome === "mismatch" ? `mismatch:${verdict.reason}` : "pending",
    });
    if (verdict.outcome === "mismatch") {
      log.scope("payments").error(`konnect mismatch on ${payment.id}`, { reason: verdict.reason });
    }
    return verdict.outcome;
  }

  // Captured in the database, which logs the event and opens the period (0191).
  const { data, error } = await admin.rpc("confirm_payment", {
    p_payment_id: payment.id,
    p_source: source,
    p_verified: verdict.snapshot,
  });
  if (error) {
    log.scope("payments").error(`confirm_payment failed for ${payment.id}: ${error.message}`);
    await admin.from("payment_events").insert({
      payment_id: payment.id, provider: "konnect", provider_ref: payment.provider_ref, source,
      verified: verdict.snapshot, outcome: "error",
    });
    return "error";
  }
  return data as CheckOutcome;
}
