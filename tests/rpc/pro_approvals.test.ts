// ============================================================================
// Lot A — pro approvals (migration 0196).
//
// The decisions it rests on:
//   D-A2  request → an admin approves or refuses → the seller pays → open
//   D-A3  opening and plan changes need an approval, renewals and boosts do
//         not, each switchable in `app_settings.pro_approvals`
//   D-A6  what is already open or already paid keeps its course
//
// Purchases are made the way /api/pro/checkout makes them — the service role
// inserting a `payments` row — so each refusal here is the database's own
// (`_payments_need_approval`), not a route's. Decisions are made the way the
// console makes them: an admin's own session calling admin_decide_pro_request.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let boss: TestUser;
let vehicleCat: string;
let starter: string;
let pro: string;
let boost: string;
let savedSetting: unknown;
const users: TestUser[] = [];
const shops: string[] = [];

async function user(): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  return u;
}

/** A shop as /api/pro/shops leaves it: a draft, its owner a member. */
async function draftShop(owner: string, status = "draft"): Promise<string> {
  const id = (await db.query(
    `insert into shops (owner_id, activity_type, slug, name, governorate, status)
     values ($1, 'vente_auto', $2, 'Boutique validation', 'Tunis', $3) returning id`,
    [owner, `val-${randomUUID().slice(0, 8)}`, status],
  )).rows[0].id as string;
  shops.push(id);
  await db.query(`insert into shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`, [id, owner]);
  return id;
}

/** A period already running on `plan`, as a past payment or a grant would leave it. */
async function period(shop: string, product: string) {
  await db.query(
    `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
     select $1, id, limits, 'active', now() - interval '1 day', now() + interval '20 days', now() + interval '27 days', 'test'
       from products where id = $2`,
    [shop, product],
  );
}

const request = (shop: string, product: string, by: string, extra: Record<string, unknown> = {}) =>
  svc.from("pro_requests").insert({ shop_id: shop, product_id: product, requested_by: by, kind: "renewal", ...extra })
    .select("id, kind, status").single();

/** A purchase, the way the checkout route inserts it. */
const order = (shop: string | null, product: string, by: string, meta: Record<string, unknown> = {}, kind = "subscription") =>
  svc.from("payments").insert({
    user_id: by, kind, provider: "bank_transfer", amount: 29, status: "pending", shop_id: shop,
    metadata: { product_id: product, expected_amount: 29, ...meta },
  }).select("id").single();

const decide = (who: SupabaseClient, id: string, decision: string, reason?: string) =>
  who.rpc("admin_decide_pro_request", { p_request: id, p_decision: decision, p_reason: reason ?? null });

const shopStatus = async (id: string) =>
  (await db.query(`select status, rejection_reason from shops where id = $1`, [id])).rows[0] as { status: string; rejection_reason: string | null };

const setApprovals = (v: Record<string, boolean>) =>
  db.query(`update app_settings set value = $1 where key = 'pro_approvals'`, [JSON.stringify(v)]);

const DEFAULTS = { opening: true, plan_change: true, renewal: false, boost: false };

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  vehicleCat = (await db.query(
    `select id from categories where kind='vehicle' and parent_id is not null and is_active order by sort_order limit 1`,
  )).rows[0].id;
  const ids = (await db.query(`select slug, id from products where slug in ('plan-starter', 'plan-pro', 'boost-7j')`)).rows;
  starter = ids.find((r) => r.slug === "plan-starter").id;
  pro = ids.find((r) => r.slug === "plan-pro").id;
  boost = ids.find((r) => r.slug === "boost-7j").id;
  savedSetting = (await db.query(`select value from app_settings where key = 'pro_approvals'`)).rows[0]?.value;
  await setApprovals(DEFAULTS);

  // An admin the way the console sees one (0066): profiles.role, set through
  // the guard's bypass in one transaction.
  boss = await user();
  await db.query("begin");
  await db.query(`select set_config('app.bypass_profile_guard', 'on', true)`);
  await db.query(`update profiles set role = 'admin' where id = $1`, [boss.id]);
  await db.query("commit");
});

afterAll(async () => {
  if (savedSetting !== undefined) {
    await db.query(`update app_settings set value = $1 where key = 'pro_approvals'`, [JSON.stringify(savedSetting)]);
  }
  for (const s of shops) {
    await db.query(`delete from pro_requests where shop_id = $1`, [s]);
    await db.query(`delete from boosts where shop_id = $1`, [s]).catch(() => {});
    await db.query(`delete from subscriptions where shop_id = $1`, [s]);
    await db.query(`delete from payments where shop_id = $1`, [s]).catch(() => {});
    await db.query(`delete from listings where shop_id = $1`, [s]);
    await db.query(`delete from shops where id = $1`, [s]);
  }
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

describe("the setting — what needs an admin", () => {
  it("defaults to opening and plan changes, not renewals and boosts, even with the row missing", async () => {
    const need = async (k: string) => (await svc.rpc("pro_approval_required", { p_kind: k })).data;
    expect([await need("opening"), await need("plan_change"), await need("renewal"), await need("boost")])
      .toEqual([true, true, false, false]);
    await db.query(`update app_settings set key = 'pro_approvals_off' where key = 'pro_approvals'`);
    try {
      expect([await need("opening"), await need("plan_change"), await need("renewal")]).toEqual([true, true, false]);
    } finally {
      await db.query(`update app_settings set key = 'pro_approvals' where key = 'pro_approvals_off'`);
    }
  });

  it("is not something a seller can read or call", async () => {
    const o = await user();
    expect((await o.client.rpc("pro_approval_required", { p_kind: "opening" })).error).not.toBeNull();
    expect((await o.client.rpc("pro_request_kind", { p_shop: randomUUID(), p_product: starter })).error).not.toBeNull();
  });
});

describe("opening a shop — request, approval, payment", () => {
  it("refuses to take money for an opening nobody approved", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const r = await order(shop, starter, o.id);
    expect(r.error?.message).toContain("approval_required");
  });

  it("files the request with the kind the database decides, and puts the shop in review", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const r = await request(shop, starter, o.id);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ kind: "opening", status: "pending" });
    expect((await shopStatus(shop)).status).toBe("pending_review");

    // Still no payment while it waits, and not a second request either.
    expect((await order(shop, starter, o.id, { request_id: r.data!.id })).error?.message).toContain("approval_required");
    expect((await request(shop, pro, o.id)).error?.code).toBe("23505");
  });

  it("lets only an admin decide, never the seller or the service key on its own", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    expect((await decide(o.client, req.id, "approve")).error?.message).toContain("forbidden");
    expect((await svc.from("pro_requests").update({ status: "approved" }).eq("id", req.id)).error?.message)
      .toContain("admin_only");
    expect((await o.client.from("pro_requests").update({ status: "approved" }).eq("id", req.id)).error).not.toBeNull();
    expect((await decide(boss.client, req.id, "reject", "  ")).error?.message).toContain("reason_required");
    expect((await decide(boss.client, req.id, "maybe")).error?.message).toContain("bad_decision");
  });

  it("approved → paid → captured: the shop opens and the request is done", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    const ok = await decide(boss.client, req.id, "approve");
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ status: "approved", kind: "opening" });
    expect((await decide(boss.client, req.id, "approve")).error?.message).toContain("request_already_decided");

    // The approval is for Starter: Pro is still a different purchase.
    expect((await order(shop, pro, o.id, { request_id: req.id })).error?.message).toContain("approval_required");
    const pay = await order(shop, starter, o.id, { request_id: req.id });
    expect(pay.error).toBeNull();
    // A receipt is on its way: taking the approval back would strand the money.
    await svc.from("payments").update({ status: "pending_review" }).eq("id", pay.data!.id);
    expect((await decide(boss.client, req.id, "revoke", "Erreur")).error?.message).toContain("payment_in_progress");

    expect((await svc.rpc("confirm_payment", { p_payment_id: pay.data!.id, p_source: "admin" })).data).toBe("captured");
    const done = (await db.query(`select status, payment_id, decided_by from pro_requests where id = $1`, [req.id])).rows[0];
    expect(done).toMatchObject({ status: "completed", payment_id: pay.data!.id, decided_by: boss.id });
    expect((await shopStatus(shop)).status).toBe("active");
    expect(Number((await db.query(`select count(*) n from subscriptions where shop_id = $1`, [shop])).rows[0].n)).toBe(1);

    const note = (await db.query(
      `select kind, body, link from notifications where user_id = $1 and kind = 'pro_request_approved'`, [o.id])).rows;
    expect(note).toHaveLength(1);
    expect(note[0].body).toContain("« Starter »");
    expect(note[0].link).toBe("/pro/dashboard/abonnement");

    const trail = (await db.query(
      `select action, actor_id, after->>'status' status from audit_logs where entity = 'pro_request' and entity_id = $1 order by created_at`,
      [req.id])).rows;
    expect(trail.map((t) => t.status)).toEqual(["pending", "approved", "completed"]);
    expect(trail[1].actor_id).toBe(boss.id);
  });

  it("a refusal refuses the shop with the reason, and asking again puts it back in review", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    expect((await decide(boss.client, req.id, "reject", "Pièces manquantes")).error).toBeNull();
    expect(await shopStatus(shop)).toEqual({ status: "rejected", rejection_reason: "Pièces manquantes" });
    const note = (await db.query(
      `select body from notifications where user_id = $1 and kind = 'pro_request_rejected'`, [o.id])).rows[0];
    expect(note.body).toContain("Motif : Pièces manquantes");

    // A refused shop cannot pay its way in, but it can ask again.
    expect((await order(shop, starter, o.id, { request_id: req.id })).error?.message).toContain("approval_required");
    const again = await request(shop, pro, o.id);
    expect(again.error).toBeNull();
    expect(again.data!.kind).toBe("opening");
    expect(await shopStatus(shop)).toEqual({ status: "pending_review", rejection_reason: null });
  });

  it("withdrawing an opening request leaves the shop a draft; a suspended shop cannot ask", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    expect((await svc.from("pro_requests").update({ status: "cancelled" }).eq("id", req.id)).error).toBeNull();
    expect((await shopStatus(shop)).status).toBe("draft");
    expect((await svc.from("pro_requests").update({ status: "pending" }).eq("id", req.id)).error?.message)
      .toContain("invalid_transition");

    const o2 = await user();
    const stopped = await draftShop(o2.id, "suspended");
    expect((await request(stopped, starter, o2.id)).error?.message).toContain("shop_not_allowed");
  });

  it("an admin can take an approval back, with a reason, before it is paid", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    await decide(boss.client, req.id, "approve");
    // An order started and left at « à régler », no receipt: it goes with the approval.
    const left = (await order(shop, starter, o.id, { request_id: req.id })).data!;
    expect((await decide(boss.client, req.id, "revoke")).error?.message).toContain("reason_required");
    expect((await decide(boss.client, req.id, "revoke", "Documents à revoir")).data).toMatchObject({ status: "cancelled" });
    expect((await db.query(`select status from payments where id = $1`, [left.id])).rows[0].status).toBe("failed");
    expect((await shopStatus(shop)).status).toBe("draft");
    expect((await order(shop, starter, o.id, { request_id: req.id })).error?.message).toContain("approval_required");
  });

  it("keeps a request as it was asked", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    expect((await svc.from("pro_requests").update({ product_id: pro }).eq("id", req.id)).error?.message).toContain("request_frozen");
    expect((await svc.from("pro_requests").update({ reason: "x" }).eq("id", req.id)).error?.message).toContain("request_frozen");
  });
});

describe("after the opening — plan changes, renewals and boosts", () => {
  it("a different plan needs an approval, the same plan does not — until the setting says so", async () => {
    const o = await user();
    const shop = await draftShop(o.id, "active");
    await period(shop, starter);

    expect((await order(shop, pro, o.id)).error?.message).toContain("approval_required");
    const change = (await request(shop, pro, o.id)).data!;
    expect(change.kind).toBe("plan_change");
    expect((await shopStatus(shop)).status).toBe("active");
    await decide(boss.client, change.id, "approve");
    expect((await order(shop, pro, o.id, { request_id: change.id })).error).toBeNull();

    // One owner, one open shop (0185): a second owner for the renewal case.
    const o2 = await user();
    const s2 = await draftShop(o2.id, "active");
    await period(s2, starter);
    expect((await order(s2, starter, o2.id)).error).toBeNull();
    await setApprovals({ ...DEFAULTS, renewal: true });
    try {
      expect((await order(s2, starter, o2.id)).error?.message).toContain("approval_required");
      expect((await request(s2, starter, o2.id)).data!.kind).toBe("renewal");
    } finally {
      await setApprovals(DEFAULTS);
    }
  });

  it("opening without an approval is possible again once the switch is off", async () => {
    const o = await user();
    const shop = await draftShop(o.id);
    await setApprovals({ ...DEFAULTS, opening: false });
    try {
      expect((await order(shop, starter, o.id)).error).toBeNull();
    } finally {
      await setApprovals(DEFAULTS);
    }
  });

  it("a boost needs an approval only when the switch is on, and only for that annonce", async () => {
    const o = await user();
    const shop = await draftShop(o.id, "active");
    await period(shop, starter);
    const listing = (await db.query(
      `insert into listings (seller_id, shop_id, category_id, title, governorate, price, contact_phone,
                             seller_attestation_version, status, published_at, expires_at)
       values ($1, $2, $3, 'Golf boost', 'Tunis', 61000, '+21620000000', 'v1', 'published', now(), now() + interval '30 days')
       returning id`,
      [o.id, shop, vehicleCat],
    )).rows[0].id as string;

    expect((await order(shop, boost, o.id, { listing_id: listing }, "promo")).error).toBeNull();
    await setApprovals({ ...DEFAULTS, boost: true });
    try {
      expect((await order(shop, boost, o.id, { listing_id: listing }, "promo")).error?.message).toContain("approval_required");
      const req = await request(shop, boost, o.id, { listing_id: listing });
      expect(req.data).toMatchObject({ kind: "boost", status: "pending" });
      await decide(boss.client, req.data!.id, "approve");
      expect((await order(shop, boost, o.id, { listing_id: randomUUID(), request_id: req.data!.id }, "promo")).error?.message)
        .toContain("approval_required");
      expect((await order(shop, boost, o.id, { listing_id: listing, request_id: req.data!.id }, "promo")).error).toBeNull();
    } finally {
      await setApprovals(DEFAULTS);
    }
  });
});

describe("who reads the requests", () => {
  it("the shop's members and admins, nobody else; nobody writes them directly", async () => {
    const o = await user();
    const outsider = await user();
    const shop = await draftShop(o.id);
    const req = (await request(shop, starter, o.id)).data!;
    expect((await o.client.from("pro_requests").select("id").eq("id", req.id)).data).toHaveLength(1);
    expect((await boss.client.from("pro_requests").select("id").eq("id", req.id)).data).toHaveLength(1);
    expect((await outsider.client.from("pro_requests").select("id").eq("id", req.id)).data).toHaveLength(0);
    expect((await anon().from("pro_requests").select("id").eq("id", req.id)).error).not.toBeNull();
    expect((await o.client.from("pro_requests").insert({ shop_id: shop, product_id: pro, requested_by: o.id, kind: "opening" })).error)
      .not.toBeNull();
  });
});
