// Platform settings — runtime config read from `platform_settings` table.
// Per dev_report decision #1 / golden rule #1: every business number lives
// in the DB so Admin can tune it without a deploy. Hardcoded numbers in
// business logic are a bug.
//
// Caching strategy:
//   - process-level Map with 60s TTL (matches the original Redis spec)
//   - React `cache()` dedupes within a single request
//   - Defaults are used as fallbacks if the table or row is missing, so a
//     fresh checkout still boots before the migration runs.
//
// Server-only — never import this from a "use client" file.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const TTL_MS = 60_000;

type CacheEntry = { value: unknown; expiresAt: number };
const memCache = new Map<string, CacheEntry>();

/** Wipe the cache. Call after writing a setting via the Admin panel. */
export function invalidateSettingsCache(key?: string): void {
  if (key) memCache.delete(key);
  else memCache.clear();
}

async function fetchSetting(key: string): Promise<unknown | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    // Table may not exist yet on a fresh checkout — fall through to default
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[config] fetch failed for "${key}":`, error.message);
    }
    return undefined;
  }
  return data?.value;
}

/**
 * Read a setting by key, with a typed default. Caches per-process for 60s
 * and per-request via React cache().
 */
export const getSetting = cache(
  async <T>(key: string, fallback: T): Promise<T> => {
    const now = Date.now();
    const hit = memCache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }

    const fetched = await fetchSetting(key);
    const value = (fetched ?? fallback) as T;
    memCache.set(key, { value, expiresAt: now + TTL_MS });
    return value;
  },
);

// ---------- Typed accessors ----------
// Prefer these over getSetting() at call sites — defaults stay in one place
// and the type signature documents what each setting looks like.

export const getCommissionSellerPct = () =>
  getSetting<number>("auction.commission.seller_pct", 0.07);

export const getCommissionSellerCap = () =>
  getSetting<number>("auction.commission.seller_cap", 15000);

export const getCommissionBuyerPct = () =>
  getSetting<number>("auction.commission.buyer_pct", 0);

export const getTvaRate = () =>
  getSetting<number>("auction.tva_rate", 0.19);

export const getDepositStartingPct = () =>
  getSetting<number>("auction.deposit.starting_pct", 0.05);

export const getAntiSnipingWindowMinutes = () =>
  getSetting<number>("auction.anti_sniping.window_minutes", 5);

export const getAntiSnipingExtensionMinutes = () =>
  getSetting<number>("auction.anti_sniping.extension_minutes", 5);

export const getBuyNowMinMultiplier = () =>
  getSetting<number>("auction.buy_now.min_multiplier", 1.3);

export type BuyNowPaymentMode = "full_immediate" | "deposit_then_full";
export const getBuyNowPaymentMode = () =>
  getSetting<BuyNowPaymentMode>("auction.buy_now.payment_mode", "deposit_then_full");

export const getKycSellerRequired = () =>
  getSetting<boolean>("kyc.seller_required", true);

export const getKycBidderRequiredAbove = () =>
  getSetting<number>("kyc.bidder_required_above", 50000);

export const getKycWinnerRequiredForPayment = () =>
  getSetting<boolean>("kyc.winner_required_for_payment", true);

export const getKycFaceMatchThreshold = () =>
  getSetting<number>("kyc.face_match_threshold", 95);

export const getKycOcrConfidenceThreshold = () =>
  getSetting<number>("kyc.ocr_confidence_threshold", 95);

export const getListingPhotosRequired = () =>
  getSetting<number>("listing.photos.required_count", 12);

export const getListingVideoRequired = () =>
  getSetting<boolean>("listing.video.required", true);

export const getListingVideoMinSeconds = () =>
  getSetting<number>("listing.video.min_seconds", 30);

export const getListingVideoMaxSeconds = () =>
  getSetting<number>("listing.video.max_seconds", 120);

export type PaymentProvider = "simulation" | "konnect" | "clictopay";
export const getActivePaymentProvider = () =>
  getSetting<PaymentProvider>("payment.active_provider", "simulation");

/** Bundle commonly-used commission settings into one round-trip. */
export async function getCommissionConfig() {
  const [sellerPct, sellerCap, tvaRate] = await Promise.all([
    getCommissionSellerPct(),
    getCommissionSellerCap(),
    getTvaRate(),
  ]);
  return { sellerPct, sellerCap, tvaRate };
}
