import { createHmac, timingSafeEqual } from "node:crypto";
import { keyFromEnv, seal, unseal } from "@/lib/secrets";

/**
 * Secrets of the Social Publisher (D-S3).
 *
 * TOKENS. A Page's access token lets anyone holding it publish as that shop,
 * so it is encrypted by the application (AES-256-GCM) with a key that lives in
 * Vercel (`SOCIAL_TOKEN_KEY`, 32 random bytes in base64) — never in the
 * database. A copy of the database alone yields no usable token. The stored
 * form carries a version prefix so the key can be rotated later.
 *
 * OAUTH STATE. The `state` sent to Meta is signed with the same key and bound
 * to the shop, the person and a nonce kept in an httpOnly cookie, so a
 * callback cannot be replayed into another shop or another browser.
 */

const key = () => keyFromEnv("SOCIAL_TOKEN_KEY");

export function isSocialCryptoConfigured(): boolean {
  return key() !== null;
}

export function encryptToken(plain: string): string {
  const k = key();
  if (!k) throw new Error("SOCIAL_TOKEN_KEY missing or not 32 bytes");
  return seal(k, plain);
}

/** The token, or null if it cannot be read (other key, tampered, empty). */
export function decryptToken(stored: string | null | undefined): string | null {
  return unseal(key(), stored);
}

export type OAuthState = { shopId: string; userId: string; nonce: string; exp: number };

/** The httpOnly cookie holding the nonce of a connection in progress. */
export const OAUTH_NONCE_COOKIE = "social_oauth_nonce";

function sign(payload: string, k: Buffer): string {
  return createHmac("sha256", k).update(payload).digest("base64url");
}

export function signState(s: OAuthState): string {
  const k = key();
  if (!k) throw new Error("SOCIAL_TOKEN_KEY missing or not 32 bytes");
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload, k)}`;
}

/** The state if its signature holds and it has not expired, else null. */
export function readState(raw: string | null | undefined, now = Date.now()): OAuthState | null {
  const k = key();
  if (!k || !raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, k));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return typeof s.exp === "number" && s.exp > now ? s : null;
  } catch {
    return null;
  }
}
