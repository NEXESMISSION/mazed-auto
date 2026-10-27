// ============================================================================
// 0198 — one subscription per shop: subscribe once, then renew, upgrade,
// downgrade or cancel it.
//
//   * a second subscription is refused — at the order and again at capture;
//   * one open order per shop, whatever arrives at once (double click, two
//     tabs, concurrent calls); a confirmation delivered twice applies once;
//   * an upgrade is prorated, changes the SAME period from capture, keeps the
//     renewal date; a failed payment changes nothing;
//   * a downgrade is scheduled for the renewal, which takes it; a cancellation
//     stops the renewal and keeps the plan to the end, refunding nothing;
//   * one scheduled change at a time, and none while an order is open;
//   * no two periods ever overlap.
//
// Orders are placed the way /api/pro/checkout places them —
// `create_subscription_order` with the service role — and captured the way the
// webhook and the admin do, through `confirm_payment`.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DAY = 86_400_000;

let svc: SupabaseClient;
let db: Client;
type Plan = { id: string; price: number };
let starter: Plan;
let pro: Plan;
let business: Plan;
let savedApprovals: unknown;
let savedActive: { id: string; is_active: boolean }[] = [];
const users: TestUser[] = [];
const shops: string[] = [];

async function owner(): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  return u;
}

async function makeShop(ownerId: string): Promise<string> {
  const r = await db.query(
    `insert into shops (owner_id, activity_type, slug, name, governorate, status)
     values ($1, 'vente_auto', $2, 'Boutique abonnement', 'Tunis', 'active') returning id`,
    [ownerId, `sub-${randomUUID().slice(0, 8)}`],
  );
  await db.query(`insert into shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`, [r.rows[0].id, ownerId]);
  shops.push(r.rows[0].id);
  return r.rows[0].id;
}

/** A period already running, in days from now — as a past payment would have left it. */
async function period(shop: string, plan: Plan, startDays: number, endDays: number, graceDays = endDays + 7): Promise<string> {
  const r = await db.query(
    `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
     select $1, id, limits, case when $4 < 0 then 'grace' else 'active' end,
            now() + make_interval(days => $3), now() + make_interval(days => $4), now() + make_interval(days => $5), 'test'
       from products where id = $2
     returning id`,
    [shop, plan.id, startDays, endDays, graceDays],
  );
  return r.rows[0].id;
}

/** A shop with an owner and a running period. */
async function subscribed(plan: Plan, startDays = -10, endDays = 20) {
  const o = await owner();
  const shop = await makeShop(o.id);
  const sub = await period(shop, plan, startDays, endDays);
  return { o, shop, sub };
}

const quote = async (shop: string, plan: Plan, intent: string) =>
  (await svc.rpc("subscription_quote", { p_shop: shop, p_product: plan.id, p_intent: intent })).data as Record<string, unknown>;

const order = (shop: string, userId: string, plan: Plan, intent: string, provider = "konnect") =>
  svc.rpc("create_subscription_order", {
    p_shop: shop, p_user: userId, p_product: plan.id, p_intent: intent, p_provider: provider, p_request: null,
  });

const placed = async (shop: string, userId: string, plan: Plan, intent: string) => {
  const { data, error } = await order(shop, userId, plan, intent);
  if (error) throw new Error(`order failed: ${error.message}`);
  return data as { payment_id: string; amount: number; reused: boolean };
};

const confirm = (id: string) =>
  svc.rpc("confirm_payment", { p_payment_id: id, p_source: "webhook", p_verified: { status: "completed" } });

const change = (shop: string, userId: string, action: string, plan?: Plan) =>
  svc.rpc("shop_subscription_change", { p_shop: shop, p_actor: userId, p_action: action, p_product: plan?.id ?? null });

const periods = async (shop: string) =>
  (await db.query(
    `select s.id, p.plan_code, s.limits, s.starts_at, s.ends_at, s.scheduled_change, sp.plan_code as scheduled_plan
       from subscriptions s join products p on p.id = s.product_id left join products sp on sp.id = s.scheduled_product_id
      where s.shop_id = $1 and s.status <> 'cancelled' order by s.starts_at`,
    [shop],
  )).rows as { id: string; plan_code: string; limits: { vehicles: number }; starts_at: Date; ends_at: Date; scheduled_change: string | null; scheduled_plan: string | null }[];

const changes = async (shop: string) =>
  (await db.query(`select kind, payment_id, amount from subscription_changes where shop_id = $1 order by created_at, kind`, [shop])).rows
    .map((r) => r.kind as string);

const openOrders = async (shop: string) =>
  Number((await db.query(
    `select count(*) n from payments where shop_id = $1 and kind = 'subscription' and status in ('pending', 'pending_review')`,
    [shop],
  )).rows[0].n);

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  const rows = (await db.query(`select id, price, plan_code, is_active from products where plan_code in ('starter', 'pro', 'business')`)).rows;
  savedActive = rows.map((r) => ({ id: r.id, is_active: r.is_active }));
  await db.query(`update products set is_active = true where plan_code in ('starter', 'pro', 'business')`);
  const by = (code: string) => {
    const r = rows.find((x) => x.plan_code === code);
    return { id: r.id as string, price: Number(r.price) };
  };
  starter = by("starter");
  pro = by("pro");
  business = by("business");
  expect(starter.price).toBeLessThan(pro.price);
  expect(pro.price).toBeLessThan(business.price);
  // Whether a purchase waits for an admin is pro_approvals.test.ts's subject.
  savedApprovals = (await db.query(`select value from app_settings where key = 'pro_approvals'`)).rows[0]?.value;
  await db.query(
    `update app_settings set value = '{"opening": false, "plan_change": false, "renewal": false, "boost": false}' where key = 'pro_approvals'`,
  );
});

afterAll(async () => {
  if (savedApprovals !== undefined) {
    await db.query(`update app_settings set value = $1 where key = 'pro_approvals'`, [JSON.stringify(savedApprovals)]);
  }
  for (const p of savedActive) await db.query(`update products set is_active = $2 where id = $1`, [p.id, p.is_active]);
  for (const s of shops) {
    await db.query(`delete from subscription_changes where shop_id = $1`, [s]);
    await db.query(`delete from subscriptions where shop_id = $1`, [s]);
    await db.query(`delete from payment_events where payment_id in (select id from payments where shop_id = $1)`, [s]);
    await db.query(`delete from payments where shop_id = $1`, [s]);
    await db.query(`delete from notifications where user_id in (select owner_id from shops where id = $1)`, [s]).catch(() => {});
    await db.query(`delete from shops where id = $1`, [s]);
  }
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

// ── One subscription ─────────────────────────────────────────────────────────

describe("one subscription per shop", () => {
  it("a shop subscribes once; a second subscription is refused at the order and at capture", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    const q = await quote(shop, starter, "subscribe");
    expect(q).toMatchObject({ intent: "subscribe", amount: starter.price });
    const pay = await placed(shop, o.id, starter, "subscribe");
    expect((await confirm(pay.payment_id)).data).toBe("captured");
    expect(await periods(shop)).toHaveLength(1);

    expect(await quote(shop, pro, "subscribe")).toEqual({ error: "subscription_exists" });
    expect((await order(shop, o.id, pro, "subscribe")).error?.message).toContain("subscription_exists");

    // An order that slipped past the route — an old one, a direct insert — is
    // refused when it is captured, instead of becoming a second subscription.
    const stray = await svc.from("payments").insert({
      user_id: o.id, kind: "subscription", provider: "bank_transfer", amount: business.price, status: "pending",
      shop_id: shop, metadata: { product_id: business.id, expected_amount: business.price },
    }).select("id").single();
    expect((await confirm(stray.data!.id)).error?.message).toContain("plan_change_not_allowed");
    expect((await db.query(`select status from payments where id = $1`, [stray.data!.id])).rows[0].status).toBe("pending");
    expect((await periods(shop)).map((p) => p.plan_code)).toEqual(["starter"]);
  });

  it("no two periods of a shop can overlap, however they are written", async () => {
    const { shop } = await subscribed(starter);
    await expect(
      db.query(
        `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
         select $1, id, limits, 'active', now(), now() + interval '30 days', now() + interval '37 days', 'test'
           from products where id = $2`,
        [shop, pro.id],
      ),
    ).rejects.toThrow(/subscriptions_no_overlap/);
  });
});

// ── Duplicates ───────────────────────────────────────────────────────────────

describe("no duplicate orders, no duplicate effects", () => {
  it("five simultaneous clicks make one order", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => order(shop, o.id, starter, "subscribe")));
    for (const r of results) expect(r.error).toBeNull();
    const ids = new Set(results.map((r) => (r.data as { payment_id: string }).payment_id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => (r.data as { reused: boolean }).reused)).toHaveLength(4);
    expect(await openOrders(shop)).toBe(1);
  });

  it("a different order while one is open is refused; the database refuses a second open order outright", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await placed(shop, o.id, starter, "subscribe");
    expect((await order(shop, o.id, pro, "subscribe")).error?.message).toContain("order_open");
    expect((await order(shop, o.id, starter, "subscribe", "bank_transfer")).error?.message).toContain("order_open");
    const direct = await svc.from("payments").insert({
      user_id: o.id, kind: "subscription", provider: "bank_transfer", amount: pro.price, status: "pending",
      shop_id: shop, metadata: { product_id: pro.id, expected_amount: pro.price },
    });
    expect(direct.error?.code).toBe("23505");
    expect(await openOrders(shop)).toBe(1);
  });

  it("a confirmation delivered twice, or twice at once, applies once", async () => {
    const { o, shop, sub } = await subscribed(starter);
    const pay = await placed(shop, o.id, pro, "upgrade");
    const [a, b] = await Promise.all([confirm(pay.payment_id), confirm(pay.payment_id)]);
    expect([a.data, b.data].sort()).toEqual(["already_captured", "captured"]);
    expect((await confirm(pay.payment_id)).data).toBe("already_captured");
    expect(await changes(shop)).toEqual(["upgraded"]);
    const [p] = await periods(shop);
    expect(p).toMatchObject({ id: sub, plan_code: "pro" });
  });
});

// ── Upgrade ──────────────────────────────────────────────────────────────────

describe("upgrade — now, prorated, on the same period", () => {
  it("charges the difference for the time left and keeps the renewal date", async () => {
    const { o, shop, sub } = await subscribed(starter, -10, 20);
    const before = (await periods(shop))[0];
    const q = await quote(shop, pro, "upgrade");
    const left = (before.ends_at.getTime() - Date.now()) / (before.ends_at.getTime() - before.starts_at.getTime());
    const expected = Math.ceil((pro.price - starter.price) * left * 100) / 100;
    expect(Number(q.amount)).toBeGreaterThan(0);
    expect(Math.abs(Number(q.amount) - expected)).toBeLessThanOrEqual(0.01);
    expect(new Date(q.renews_at as string).getTime()).toBe(before.ends_at.getTime());

    const pay = await placed(shop, o.id, pro, "upgrade");
    expect(Number(pay.amount)).toBe(Number(q.amount));
    expect((await confirm(pay.payment_id)).data).toBe("captured");

    const after = await periods(shop);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: sub, plan_code: "pro", limits: { vehicles: 40 } });
    expect(after[0].ends_at.getTime()).toBe(before.ends_at.getTime());
    const row = (await db.query(`select kind, payment_id, amount from subscription_changes where shop_id = $1`, [shop])).rows[0];
    expect(row).toMatchObject({ kind: "upgraded", payment_id: pay.payment_id });
    expect(Number(row.amount)).toBe(Number(pay.amount));

    // The next renewal is the new plan at its full price.
    await db.query(`update subscriptions set ends_at = now() + interval '3 days', grace_ends_at = now() + interval '10 days' where id = $1`, [sub]);
    expect(await quote(shop, pro, "renew")).toMatchObject({ intent: "renew", amount: pro.price });
    expect(await quote(shop, starter, "renew")).toMatchObject({ error: "renewal_plan_mismatch" });
  });

  it("a failed payment leaves the plan and its benefits as they were", async () => {
    const { o, shop, sub } = await subscribed(starter);
    const pay = await placed(shop, o.id, pro, "upgrade");
    await svc.from("payments").update({ status: "failed" }).eq("id", pay.payment_id);
    expect((await confirm(pay.payment_id)).data).toBe("not_capturable");
    expect(await periods(shop)).toMatchObject([{ id: sub, plan_code: "starter", limits: { vehicles: 10 } }]);
    expect(await changes(shop)).toEqual([]);
    // The slot is free again for another try.
    expect((await order(shop, o.id, pro, "upgrade")).error).toBeNull();
  });

  it("is refused at capture when the period it was priced on changed or ended", async () => {
    const a = await subscribed(starter);
    const stale = await placed(a.shop, a.o.id, pro, "upgrade");
    await db.query(`update subscriptions set product_id = $2 where id = $1`, [a.sub, business.id]);
    expect((await confirm(stale.payment_id)).error?.message).toContain("upgrade_stale");

    const b = await subscribed(starter);
    const late = await placed(b.shop, b.o.id, pro, "upgrade");
    await db.query(`update subscriptions set ends_at = now() - interval '1 hour' where id = $1`, [b.sub]);
    expect((await confirm(late.payment_id)).error?.message).toContain("upgrade_period_over");
    expect(await periods(b.shop)).toMatchObject([{ plan_code: "starter" }]);
  });

  it("is only ever up, and not while the next period is already paid", async () => {
    const { o, shop, sub } = await subscribed(pro);
    expect(await quote(shop, starter, "upgrade")).toEqual({ error: "not_an_upgrade" });
    expect(await quote(shop, pro, "upgrade")).toEqual({ error: "not_an_upgrade" });
    await db.query(`update subscriptions set ends_at = now() + interval '3 days', grace_ends_at = now() + interval '10 days' where id = $1`, [sub]);
    const renewal = await placed(shop, o.id, pro, "renew");
    await confirm(renewal.payment_id);
    expect(await quote(shop, business, "upgrade")).toEqual({ error: "next_period_paid" });
  });
});

// ── Downgrade ────────────────────────────────────────────────────────────────

describe("downgrade — scheduled for the renewal", () => {
  it("changes nothing before the renewal date, and the renewal takes it", async () => {
    const { o, shop, sub } = await subscribed(pro, -25, 5);
    const r = await change(shop, o.id, "downgrade", starter);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ scheduled_change: "downgrade", plan_code: "starter" });
    expect(await periods(shop)).toMatchObject([{ id: sub, plan_code: "pro", limits: { vehicles: 40 }, scheduled_change: "downgrade", scheduled_plan: "starter" }]);

    expect(await quote(shop, pro, "renew")).toMatchObject({ error: "renewal_plan_mismatch" });
    const q = await quote(shop, starter, "renew");
    expect(q).toMatchObject({ amount: starter.price, takes_downgrade: true });
    const before = (await periods(shop))[0];
    expect(new Date(q.effective_at as string).getTime()).toBe(before.ends_at.getTime());

    const pay = await placed(shop, o.id, starter, "renew");
    expect((await confirm(pay.payment_id)).data).toBe("captured");
    const after = await periods(shop);
    expect(after.map((p) => [p.plan_code, p.scheduled_change])).toEqual([["pro", null], ["starter", null]]);
    expect(after[1].starts_at.getTime()).toBe(before.ends_at.getTime());
    expect(await changes(shop)).toEqual(["downgrade_scheduled", "downgrade_applied"]);
  });

  it("can be changed or withdrawn before it takes effect, and is only ever down", async () => {
    const { o, shop } = await subscribed(business);
    expect((await change(shop, o.id, "downgrade", business)).error?.message).toContain("not_a_downgrade");
    await change(shop, o.id, "downgrade", pro);
    await change(shop, o.id, "downgrade", starter);
    expect(await periods(shop)).toMatchObject([{ scheduled_change: "downgrade", scheduled_plan: "starter" }]);
    await change(shop, o.id, "undo_downgrade");
    expect(await periods(shop)).toMatchObject([{ scheduled_change: null, scheduled_plan: null, plan_code: "business" }]);
    // Changing the plan withdraws the first schedule; withdrawing ends the second.
    expect((await changes(shop)).sort()).toEqual([
      "downgrade_scheduled", "downgrade_scheduled", "downgrade_withdrawn", "downgrade_withdrawn",
    ]);
  });

  it("a paid upgrade withdraws a scheduled downgrade", async () => {
    const { o, shop } = await subscribed(pro);
    await change(shop, o.id, "downgrade", starter);
    expect(await quote(shop, business, "upgrade")).toMatchObject({ withdraws_downgrade: true });
    const pay = await placed(shop, o.id, business, "upgrade");
    await confirm(pay.payment_id);
    expect(await periods(shop)).toMatchObject([{ plan_code: "business", scheduled_change: null }]);
    expect(await changes(shop)).toContain("downgrade_withdrawn");
  });
});

// ── Cancel ───────────────────────────────────────────────────────────────────

describe("cancel — stops the renewal, keeps the plan to the end", () => {
  it("keeps every benefit until the end, refuses the renewal, refunds nothing", async () => {
    const { o, shop, sub } = await subscribed(pro, -25, 5);
    const paymentsBefore = (await db.query(`select count(*) n from payments where shop_id = $1`, [shop])).rows[0].n;
    const r = await change(shop, o.id, "cancel");
    expect(r.data).toMatchObject({ scheduled_change: "cancel" });
    expect(await periods(shop)).toMatchObject([{ id: sub, plan_code: "pro", limits: { vehicles: 40 }, scheduled_change: "cancel" }]);
    expect(await quote(shop, pro, "renew")).toEqual({ error: "subscription_cancelled" });
    expect((await order(shop, o.id, pro, "renew")).error?.message).toContain("subscription_cancelled");
    expect((await db.query(`select count(*) n from payments where shop_id = $1`, [shop])).rows[0].n).toBe(paymentsBefore);
    // Cancelling twice changes nothing more.
    expect((await change(shop, o.id, "cancel")).data).toMatchObject({ unchanged: true });

    // Changing one's mind before the end brings the renewal back.
    await change(shop, o.id, "resume");
    expect(await quote(shop, pro, "renew")).toMatchObject({ intent: "renew", amount: pro.price });
  });

  it("one scheduled change at a time: cancel replaces a downgrade, a downgrade replaces a cancel", async () => {
    const { o, shop } = await subscribed(business);
    await change(shop, o.id, "downgrade", pro);
    await change(shop, o.id, "cancel");
    expect(await periods(shop)).toMatchObject([{ scheduled_change: "cancel", scheduled_plan: null }]);
    await change(shop, o.id, "downgrade", starter);
    expect(await periods(shop)).toMatchObject([{ scheduled_change: "downgrade", scheduled_plan: "starter" }]);
    expect((await changes(shop)).sort()).toEqual([
      "downgrade_scheduled", "downgrade_withdrawn", "cancel_scheduled", "cancel_withdrawn", "downgrade_scheduled",
    ].sort());
    // The database itself refuses a half-written schedule.
    await expect(db.query(`update subscriptions set scheduled_change = 'cancel', scheduled_product_id = $2 where shop_id = $1`, [shop, pro.id]))
      .rejects.toThrow(/subscriptions_scheduled_shape/);
  });

  it("an upgrade after a cancellation keeps the cancellation", async () => {
    const { o, shop } = await subscribed(starter);
    await change(shop, o.id, "cancel");
    expect(await quote(shop, pro, "upgrade")).toMatchObject({ keeps_cancel: true });
    const pay = await placed(shop, o.id, pro, "upgrade");
    await confirm(pay.payment_id);
    expect(await periods(shop)).toMatchObject([{ plan_code: "pro", scheduled_change: "cancel" }]);
  });

  it("nothing is scheduled while an order is open: it was priced on the subscription as it was", async () => {
    const { o, shop } = await subscribed(starter);
    await placed(shop, o.id, pro, "upgrade");
    expect((await change(shop, o.id, "cancel")).error?.message).toContain("order_open");
    expect((await change(shop, o.id, "downgrade", starter)).error?.message).toContain("order_open");
  });
});

// ── Renewal ──────────────────────────────────────────────────────────────────

describe("renewal", () => {
  it("opens in the last 7 days, once, and starts at the end of the period", async () => {
    const early = await subscribed(starter, -5, 20);
    const q = await quote(early.shop, starter, "renew");
    expect(q.error).toBe("renewal_not_open");
    expect(new Date(q.opens_at as string).getTime()).toBeGreaterThan(Date.now() + 12 * DAY);

    const { o, shop } = await subscribed(starter, -25, 5);
    const end = (await periods(shop))[0].ends_at.getTime();
    const pay = await placed(shop, o.id, starter, "renew");
    await confirm(pay.payment_id);
    const ps = await periods(shop);
    expect(ps).toHaveLength(2);
    expect(ps[1].starts_at.getTime()).toBe(end);
    expect(await quote(shop, starter, "renew")).toEqual({ error: "renewal_already_paid" });
  });

  it("past the renewal date (grace), any plan may be chosen and starts now", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, starter, -32, -2, 5);
    const q = await quote(shop, business, "renew");
    expect(q).toMatchObject({ intent: "renew", amount: business.price });
    expect(Math.abs(new Date(q.effective_at as string).getTime() - Date.now())).toBeLessThan(60_000);
    const pay = await placed(shop, o.id, business, "renew");
    expect((await confirm(pay.payment_id)).data).toBe("captured");
    expect((await periods(shop)).map((p) => p.plan_code)).toEqual(["starter", "business"]);
  });

  it("a cancelled subscription is told when it ends, not asked to renew", async () => {
    const { o, shop } = await subscribed(pro, -25, 5);
    await change(shop, o.id, "cancel");
    await svc.rpc("expire_subscriptions");
    const n = (await db.query(
      `select title from notifications where user_id = $1 and kind = 'subscription_ending' order by created_at desc limit 1`,
      [o.id],
    )).rows[0];
    expect(n?.title).toBe("Votre abonnement prend fin dans 7 jours");
  });
});
