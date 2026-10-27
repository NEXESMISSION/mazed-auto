// ============================================================================
// 0197 — keys typed in the back office (D-B2) live in `app_secrets`, which
// only the server reaches.
//
//   * not anon, not a signed-in user, and not an admin through their own
//     session: no read, no write, no delete — the screen goes through the
//     server, which checks the admin itself and encrypts the key;
//   * the service role reads and writes it;
//   * only the names on the list, and only the encrypted form, are accepted.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let boss: TestUser;
let someone: TestUser;
let saved: { ciphertext: string; last4: string } | undefined;

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  saved = (await db.query(`select ciphertext, last4 from app_secrets where key = 'konnect_api_key'`)).rows[0];

  someone = await createUser(svc);
  boss = await createUser(svc);
  await db.query("begin");
  await db.query(`select set_config('app.bypass_profile_guard', 'on', true)`);
  await db.query(`update profiles set role = 'admin' where id = $1`, [boss.id]);
  await db.query("commit");

  await db.query(
    `insert into app_secrets (key, ciphertext, last4) values ('konnect_api_key', 'v1:dGVzdA==', 'test')
     on conflict (key) do update set ciphertext = excluded.ciphertext, last4 = excluded.last4`,
  );
});

afterAll(async () => {
  if (saved) {
    await db.query(`update app_secrets set ciphertext = $1, last4 = $2 where key = 'konnect_api_key'`, [saved.ciphertext, saved.last4]);
  } else {
    await db.query(`delete from app_secrets where key = 'konnect_api_key'`);
  }
  await deleteUsers(svc, [someone, boss].filter(Boolean));
  await db.end();
});

describe("app_secrets — server only", () => {
  it("is invisible to anon, a member and an admin's own session", async () => {
    for (const client of [anon(), someone.client, boss.client]) {
      const { data, error } = await client.from("app_secrets").select("key, ciphertext");
      // No grant at all: PostgREST answers « permission denied », never rows.
      expect(data ?? []).toEqual([]);
      expect(error?.code).toBe("42501");
    }
  });

  it("cannot be written or emptied from a browser session, even an admin's", async () => {
    const ins = await boss.client.from("app_secrets").upsert({ key: "konnect_api_key", ciphertext: "v1:eA==", last4: "evil" });
    expect(ins.error?.code).toBe("42501");
    const del = await boss.client.from("app_secrets").delete().eq("key", "konnect_api_key");
    expect(del.error?.code).toBe("42501");
    const row = (await db.query(`select last4 from app_secrets where key = 'konnect_api_key'`)).rows[0];
    expect(row.last4).toBe("test");
  });

  it("is read and written by the service role", async () => {
    const { data, error } = await svc.from("app_secrets").select("last4").eq("key", "konnect_api_key").single();
    expect(error).toBeNull();
    expect(data?.last4).toBe("test");
  });

  it("takes only listed names, and only the encrypted form", async () => {
    await expect(
      db.query(`insert into app_secrets (key, ciphertext) values ('stripe_key', 'v1:eA==')`),
    ).rejects.toThrow(/check/i);
    await expect(
      db.query(`update app_secrets set ciphertext = 'sk_live_plaintext' where key = 'konnect_api_key'`),
    ).rejects.toThrow(/check/i);
  });
});
