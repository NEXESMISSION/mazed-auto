import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { SECRETS_KEY_ENV, appSecretsReady, keyFromEnv, seal, unseal } from "./secrets";

/** D-B2: keys typed in the back office are stored encrypted, with a key the database never sees. */
describe("app secrets", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[SECRETS_KEY_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[SECRETS_KEY_ENV];
    else process.env[SECRETS_KEY_ENV] = saved;
  });

  it("refuses to work without a 32-byte key", () => {
    delete process.env[SECRETS_KEY_ENV];
    expect(appSecretsReady()).toBe(false);
    process.env[SECRETS_KEY_ENV] = randomBytes(16).toString("base64");
    expect(appSecretsReady()).toBe(false);
    process.env[SECRETS_KEY_ENV] = randomBytes(32).toString("base64");
    expect(appSecretsReady()).toBe(true);
  });

  it("round-trips, and the stored form never contains the key in clear", () => {
    const k = randomBytes(32);
    const stored = seal(k, "sk_live_1234567890abcdef");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("1234567890abcdef");
    expect(seal(k, "same")).not.toBe(seal(k, "same")); // a fresh IV every time
    expect(unseal(k, stored)).toBe("sk_live_1234567890abcdef");
  });

  it("reads nothing with another key, a tampered value or none", () => {
    const k = randomBytes(32);
    const stored = seal(k, "secret-value");
    expect(unseal(randomBytes(32), stored)).toBeNull();
    const raw = Buffer.from(stored.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(unseal(k, `v1:${raw.toString("base64")}`)).toBeNull();
    expect(unseal(k, null)).toBeNull();
    expect(unseal(null, stored)).toBeNull();
    expect(unseal(k, "plain-text")).toBeNull();
  });

  it("reads the key from the environment as base64", () => {
    const k = randomBytes(32);
    process.env[SECRETS_KEY_ENV] = ` ${k.toString("base64")} `;
    expect(keyFromEnv(SECRETS_KEY_ENV)?.equals(k)).toBe(true);
  });
});
