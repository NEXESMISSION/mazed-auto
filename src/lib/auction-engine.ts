import type { Auction } from "./types";
import { minBidIncrement } from "./utils";

/**
 * Compute the minimum acceptable next bid for an auction. Combines the
 * current price with the increment ladder (plan §8). Returns the
 * opening price for an auction that has no bids yet.
 */
export function nextMinBid(auction: Auction, currentBid?: number | null): number {
  const base = currentBid ?? auction.current_price ?? auction.opening_price;
  if (!auction.current_price && (currentBid ?? 0) === 0) return auction.opening_price;
  return base + minBidIncrement(base);
}

/**
 * Anti-sniping: when a bid lands inside the configured window before
 * `ends_at`, push `ends_at` forward by `extend_by_seconds`. Defaults match
 * the plan: 5 min trigger, 10 min extension. Returns the new end time
 * or `null` if no extension is needed.
 */
export function nextEndsAtAfterBid(
  auction: Auction,
  bidAt: Date,
): Date | null {
  const endsAt = new Date(auction.ends_at);
  const triggerStart = new Date(endsAt.getTime() - auction.extend_window_seconds * 1000);
  if (bidAt < triggerStart) return null;
  return new Date(endsAt.getTime() + auction.extend_by_seconds * 1000);
}

/**
 * Sixth-offer rule (offre du sixième). Per the Tunisian rules baked into
 * the plan §5, a higher offer is admissible during the 8-day window only
 * if it exceeds the winning amount by at least 1/6 (16.67%). Returns the
 * minimum admissible amount.
 */
export function minSixthOffer(winningAmount: number): number {
  return Math.ceil(winningAmount * (7 / 6));
}

/**
 * Pure helper used by the live UI to display "ends in HH:MM:SS" without
 * forcing every component to recompute the math. Returns negative seconds
 * once the auction has technically ended.
 */
export function secondsRemaining(endsAtIso: string, now: Date = new Date()): number {
  return Math.floor((new Date(endsAtIso).getTime() - now.getTime()) / 1000);
}
