// Pure deposit-tier helpers — client AND server safe.
//
// Lives outside lib/config.ts because that module imports next/headers
// (via supabase/server) and is therefore server-only. Splitting the
// pure ladder lookup out lets the seller wizard (a "use client" page)
// preview the deposit while the user is still typing the starting
// price, without dragging the server-only supabase client into the
// client bundle.

export type DepositTier = { max: number | null; deposit: number };

/**
 * Defaults match the product-owner spec:
 *   starting < 20 000 DT   → 500 DT
 *   starting < 100 000 DT  → 1 000 DT
 *   otherwise              → 2 000 DT
 *
 * Admins override these via platform_settings.auction.deposit.tiers.
 * Keep this array in sync with the seed in migrate-deposit-tiers.sql.
 */
export const DEFAULT_DEPOSIT_TIERS: DepositTier[] = [
  { max: 20000, deposit: 500 },
  { max: 100000, deposit: 1000 },
  { max: null, deposit: 2000 },
];

/** Walk the tier list in order — first tier whose `max` exceeds the
 *  starting price (or has max=null) wins. */
export function pickDepositFromTiers(
  startingPrice: number,
  tiers: DepositTier[] = DEFAULT_DEPOSIT_TIERS,
): number {
  for (const t of tiers) {
    if (t.max === null || startingPrice < t.max) return t.deposit;
  }
  return tiers[tiers.length - 1]?.deposit ?? 500;
}
