import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret compare for the cron endpoints.
 *
 * A plain `provided !== secret` short-circuits on the first differing byte,
 * leaking the secret's length and prefix through response timing to anyone who
 * can measure it. timingSafeEqual needs equal-length buffers, so length is
 * checked first — length alone is not the oracle the byte-by-byte comparison
 * would be.
 *
 * Lifted out of the auction tick route so every scheduled endpoint checks its
 * secret the same way instead of copying the helper.
 */
export function secretMatches(provided: string, secret: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
