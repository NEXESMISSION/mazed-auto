import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPaymentMethods, konnectProblems, type KonnectMethod, type KonnectMode } from "@/lib/payments";
import { konnectConfig, type KonnectConfig } from "@/lib/payments/konnect";
import { appSecretHint, readAppSecret, type SecretHint } from "@/lib/secrets";

/**
 * Which Konnect account the site uses (D-B2). The back office sets it in
 * « Moyens de paiement »: a switch, the gateway (test or live), the wallet,
 * and the API key — encrypted in `app_secrets`. A deployment that still has
 * KONNECT_API_KEY / KONNECT_WALLET_ID in its environment keeps working as
 * before for the keys, but the switch decides either way: nothing is offered
 * online until it is on.
 */

export const KONNECT_URLS: Record<KonnectMode, string> = {
  test: "https://api.sandbox.konnect.network/api/v2",
  live: "https://api.konnect.network/api/v2",
};

/** KONNECT_API_URL still wins: it points local runs at a mock. */
const baseUrl = (mode: KonnectMode) =>
  (process.env.KONNECT_API_URL?.trim() || KONNECT_URLS[mode]).replace(/\/$/, "");

/** The keys of the environment, when a deployment still sets both. */
export const konnectEnvConfigured = () => konnectConfig() !== null;

async function account(admin: SupabaseClient): Promise<{ k: KonnectMethod; cfg: KonnectConfig | null }> {
  const { konnect: k } = await fetchPaymentMethods(admin);
  const apiKey = await readAppSecret(admin, "konnect_api_key");
  if (apiKey && k.wallet) return { k, cfg: { apiKey, walletId: k.wallet, baseUrl: baseUrl(k.mode) } };
  return { k, cfg: konnectConfig() };
}

/**
 * For a new order: null unless Konnect is switched on — and, in test mode,
 * unless the buyer is an admin. The sandbox accepts test cards; offering it to
 * a seller would open a shop for a payment that never happened.
 */
export async function konnectForCheckout(admin: SupabaseClient, userId: string): Promise<KonnectConfig | null> {
  const { k, cfg } = await account(admin);
  if (!k.enabled || !cfg) return null;
  if (k.mode === "test") {
    const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if ((data as { role?: string } | null)?.role !== "admin") return null;
  }
  return cfg;
}

/**
 * For an order already made: the keys, whatever the switch says. Turning
 * Konnect off must not strand a payment a buyer has just made. (Switching the
 * gateway between test and live while orders are open does: they are then
 * looked up on the other one, and reconciliation closes them after a day.)
 */
export async function konnectForLookup(admin: SupabaseClient): Promise<KonnectConfig | null> {
  return (await account(admin)).cfg;
}

/** What « Moyens de paiement » shows of the account: never the key. */
export type KonnectStatus = {
  /** Saved key: its last characters; `readable` false when SETTINGS_SECRET_KEY changed. */
  key: SecretHint | null;
  /** SETTINGS_SECRET_KEY is set: keys can be saved. */
  canSaveKeys: boolean;
  /** The environment still provides both keys. */
  env: boolean;
  /** On, and able to take a payment. */
  live: boolean;
};

export async function konnectStatus(admin: SupabaseClient, canSaveKeys: boolean): Promise<KonnectStatus> {
  const [{ k, cfg }, key] = await Promise.all([account(admin), appSecretHint(admin, "konnect_api_key")]);
  return { key, canSaveKeys, env: konnectEnvConfigured(), live: k.enabled && cfg !== null };
}

/** Whether the switch may be turned on: the server's own check, with the key it can read. */
export function konnectBlockers(k: KonnectMethod, keyReadable: boolean): ReturnType<typeof konnectProblems> {
  // The environment's two keys are a complete account on their own.
  if (konnectEnvConfigured() && !k.wallet && !keyReadable) return [];
  return konnectProblems(k, keyReadable);
}
