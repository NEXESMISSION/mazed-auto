import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keys typed in the back office (D-B2, `app_secrets`, 0197).
 *
 * A key is encrypted by the application (AES-256-GCM) with a key of keys that
 * lives in Vercel only (`SETTINGS_SECRET_KEY`, 32 random bytes in base64) —
 * never in the database, so a copy of it yields nothing usable. The stored
 * form carries a version prefix so that key can be rotated later; the social
 * tokens (0195, D-S3) use the same form with their own key.
 *
 * Write-only: a screen gets the last four characters, never the key.
 */

const VERSION = "v1";

/** 32 bytes from a base64 environment variable, or null. */
export function keyFromEnv(name: string): Buffer | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export function seal(k: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The plain text, or null if it cannot be read (other key, tampered, empty). */
export function unseal(k: Buffer | null, stored: string | null | undefined): string | null {
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

export const SECRETS_KEY_ENV = "SETTINGS_SECRET_KEY";

export type SecretName = "konnect_api_key";

/** Whether keys can be saved at all: without the key of keys they are refused, not stored in clear. */
export function appSecretsReady(): boolean {
  return keyFromEnv(SECRETS_KEY_ENV) !== null;
}

/** What a screen may show of a saved key. */
export type SecretHint = { last4: string; updatedAt: string; readable: boolean };

/**
 * The key in clear, for the server's own calls. Null when none is saved — or
 * when it cannot be read (the key of keys changed): then it has to be typed
 * again, which the screen says.
 */
export async function readAppSecret(admin: SupabaseClient, name: SecretName): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("ciphertext").eq("key", name).maybeSingle();
  return unseal(keyFromEnv(SECRETS_KEY_ENV), (data as { ciphertext?: string } | null)?.ciphertext);
}

export async function appSecretHint(admin: SupabaseClient, name: SecretName): Promise<SecretHint | null> {
  const { data } = await admin
    .from("app_secrets")
    .select("ciphertext, last4, updated_at")
    .eq("key", name)
    .maybeSingle();
  const row = data as { ciphertext: string; last4: string; updated_at: string } | null;
  if (!row) return null;
  return {
    last4: row.last4,
    updatedAt: row.updated_at,
    readable: unseal(keyFromEnv(SECRETS_KEY_ENV), row.ciphertext) !== null,
  };
}

/** Encrypt and store; throws when the key of keys is missing — never stored in clear. */
export async function writeAppSecret(
  admin: SupabaseClient,
  name: SecretName,
  value: string,
  userId: string,
): Promise<{ error: unknown }> {
  const k = keyFromEnv(SECRETS_KEY_ENV);
  if (!k) throw new Error(`${SECRETS_KEY_ENV} missing or not 32 bytes`);
  const { error } = await admin.from("app_secrets").upsert(
    { key: name, ciphertext: seal(k, value), last4: value.slice(-4), updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  return { error };
}

export async function deleteAppSecret(admin: SupabaseClient, name: SecretName): Promise<{ error: unknown }> {
  const { error } = await admin.from("app_secrets").delete().eq("key", name);
  return { error };
}
