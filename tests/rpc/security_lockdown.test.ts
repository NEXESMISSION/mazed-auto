// ============================================================================
// 0199 — security lockdown before launch.
//
//   * server-only functions are refused to anon and signed-in callers, and no
//     SECURITY DEFINER function becomes callable by anon unless it is on the
//     list below — each of which checks its caller itself;
//   * a signed-in user cannot write their own profile row (lift a ban, claim
//     a phone, set deleted_at);
//   * a sign-in code is checked under a lock (parallel guesses are counted)
//     and earns a one-time proof that signup / reset must present.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Callable by anyone on purpose — every one checks auth.uid() / is_admin() itself, or is public data. */
const ANON_ALLOWED = new Set([
  "accept_listing_payment", "admin_approve_inspector", "admin_payment_boxes", "admin_set_listing_cover",
  "admin_set_payout_status", "admin_set_shop_state", "broadcast_notification", "cancel_auction_safe",
  "enqueue_waitlist", "get_inspection_contact", "has_verified_badge", "is_admin", "is_shop_member",
  "listing_editable_by_caller", "listing_photo_owned", "listing_photo_visible", "match_popups", "place_bid",
  "place_sixth_offer", "record_popup_event", "reject_listing_payment", "request_account_deletion",
  "request_payout", "reveal_listing_contact", "reverse_settlement", "review_kyc", "seller_balance", "seller_earnings",
]);

let svc: SupabaseClient;
let db: Client;
let someone: TestUser;
const phones: string[] = [];

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  someone = await createUser(svc);
});

afterAll(async () => {
  for (const p of phones) await db.query(`delete from phone_otps where phone = $1`, [p]);
  await deleteUsers(svc, [someone].filter(Boolean));
  await db.end();
});

describe("server-only functions", () => {
  it("refuses them to anon and to a signed-in user", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["claim_emailable_notifications", { p_limit: 1, p_kinds: ["x"], p_since: new Date().toISOString(), p_max_attempts: 1 }],
      ["claim_smsable_notifications", { p_limit: 1, p_kinds: ["x"], p_since: new Date().toISOString(), p_max_attempts: 1 }],
      ["_notify_admins", { p_kind: "x", p_title: "x", p_body: "x", p_link: "https://example.test" }],
      ["check_rate_limit", { p_key: "test", p_max: 1, p_window_secs: 1 }],
      ["check_auth_ratelimit", { p_ip: "203.0.113.9" }],
      ["shop_current_subscription", { p_shop: randomUUID() }],
      ["stamp_cron_heartbeat", { p_job: "x", p_max_age: 1 }],
    ];
    for (const client of [anon(), someone.client]) {
      for (const [fn, args] of calls) {
        const { error } = await client.rpc(fn, args);
        expect(error?.code, fn).toBe("42501");
      }
    }
    // The server still can.
    const { error } = await svc.rpc("check_rate_limit", { p_key: `lockdown:${randomUUID()}`, p_max: 5, p_window_secs: 60 });
    expect(error).toBeNull();
  });

  it("no definer function is open to anon unless it is on the reviewed list", async () => {
    const open = (await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
         and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')`)).rows
      .map((r) => r.proname as string);
    expect(open.filter((f) => !ANON_ALLOWED.has(f))).toEqual([]);
  });
});

describe("profiles are written by the server only", () => {
  it("a signed-in user cannot lift their own ban or claim a phone", async () => {
    await db.query(`update profiles set banned_at = now(), banned_reason = 'test' where id = $1`, [someone.id]);
    const unban = await someone.client.from("profiles").update({ banned_at: null, banned_reason: null }).eq("id", someone.id);
    expect(unban.error?.code).toBe("42501");
    const phone = await someone.client.from("profiles").update({ phone: "+21699000111" }).eq("id", someone.id);
    expect(phone.error?.code).toBe("42501");
    const row = (await db.query(`select banned_at from profiles where id = $1`, [someone.id])).rows[0];
    expect(row.banned_at).not.toBeNull();
    await db.query(`update profiles set banned_at = null, banned_reason = null where id = $1`, [someone.id]);
  });
});

describe("sign-in codes", () => {
  const newCode = async (phone: string, codeHash: string) => {
    phones.push(phone);
    await db.query(
      `insert into phone_otps (phone, code_hash, expires_at, attempts) values ($1, $2, now() + interval '10 minutes', 0)
       on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
         attempts = 0, verified_at = null, proof_hash = null`,
      [phone, codeHash],
    );
  };

  it("counts every one of 20 parallel wrong guesses: never more than five tries", async () => {
    const phone = `+2169${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`;
    await newCode(phone, "right-hash");
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      svc.rpc("phone_otp_try", { p_phone: phone, p_code_hash: `wrong-${i}`, p_proof_hash: "p", p_max: 5 })));
    const outcomes = results.map((r) => r.data as string);
    expect(outcomes.filter((o) => o === "wrong_code")).toHaveLength(5);
    expect(outcomes.filter((o) => o === "too_many_attempts")).toHaveLength(15);
    // Even the right code is refused once the five tries are spent.
    expect((await svc.rpc("phone_otp_try", { p_phone: phone, p_code_hash: "right-hash", p_proof_hash: "p", p_max: 5 })).data)
      .toBe("too_many_attempts");
  });

  it("a correct code earns a proof that works once, and only that proof", async () => {
    const phone = `+2169${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`;
    await newCode(phone, "right-hash");
    expect((await svc.rpc("phone_otp_try", { p_phone: phone, p_code_hash: "right-hash", p_proof_hash: "proof-A", p_max: 5 })).data).toBe("ok");
    // Someone without the proof gets nothing, even right after the verification.
    expect((await svc.rpc("phone_otp_consume", { p_phone: phone, p_proof_hash: "", p_window_secs: 900 })).data).toBe(false);
    expect((await svc.rpc("phone_otp_consume", { p_phone: phone, p_proof_hash: "proof-B", p_window_secs: 900 })).data).toBe(false);
    expect((await svc.rpc("phone_otp_consume", { p_phone: phone, p_proof_hash: "proof-A", p_window_secs: 900 })).data).toBe(true);
    // Used up.
    expect((await svc.rpc("phone_otp_consume", { p_phone: phone, p_proof_hash: "proof-A", p_window_secs: 900 })).data).toBe(false);
  });

  it("the code functions are the server's alone", async () => {
    for (const client of [anon(), someone.client]) {
      const { error } = await client.rpc("phone_otp_consume", { p_phone: "+21600000000", p_proof_hash: "x", p_window_secs: 900 });
      expect(error?.code).toBe("42501");
    }
  });
});
