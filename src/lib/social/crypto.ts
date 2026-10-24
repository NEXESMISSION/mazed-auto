import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

const VERSION = "v1";

function key(): Buffer | null {
  const raw = process.env.SOCIAL_TOKEN_KEY?.trim();
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export function isSocialCryptoConfigured(): boolean {
  return key() !== null;
}

export function encryptToken(plain: string): string {
  const k = key();
  if (!k) throw new Error("SOCIAL_TOKEN_KEY missing or not 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The token, or null if it cannot be read (other key, tampered, empty). */
export function decryptToken(stored: string | null | undefined): string | null {
  const k = key();
  if (!k || !stored?.startsWith(`${VERSION}:`)) return null;
  try {
    const raw = Buffer.from(stored.slice(VERSION.length + 1), "base64");
    const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
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
