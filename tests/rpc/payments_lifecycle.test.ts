// ============================================================================
// Lot 4 — confirmed payments, subscription periods, their end, and boosts
// (migrations 0191–0192).
//
//   recette 5   a payment confirmed twice opens ONE period
//   recette 6   (database half) a payment that is not confirmed opens nothing
//   recette 7   the end of a subscription deletes nothing: annonces pause, and
//               come back when a new period is paid
//   recette 11  a boost ends after 7 days
// and the rules around them: the amount must cover the order, a client cannot
// create a subscription payment, an early renewal does not waste days, a
// smaller plan pauses the surplus and the owner chooses, warnings go out once.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let vehicleCat: string;
let starter: { id: string; price: number };
let business: { id: string; price: number };
let boost: { id: string; price: number };
const users: TestUser[] = [];
const shops: string[] = [];

async function owner(): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  return u;
}

async function makeShop(ownerId: string, status = "active"): Promise<string> {
  const r = await db.query(
    `insert into shops (owner_id, activity_type, slug, name, governorate, status)
     values ($1, 'vente_auto', $2, 'Boutique test', 'Tunis', $3) returning id`,
    [ownerId, `pay-${randomUUID().slice(0, 8)}`, status],
  );
  await db.query(`insert into shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`, [r.rows[0].id, ownerId]);
  shops.push(r.rows[0].id);
  return r.rows[0].id;
}

async function period(shopId: string, o: { vehicles: number; startDays: number; endDays: number; graceDays: number }) {
  await db.query(
    `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
     values ($1, $2, $3::jsonb, 'active', now() + make_interval(days => $4), now() + make_interval(days => $5),
             now() + make_interval(days => $6), 'test')`,
    [shopId, starter.id, JSON.stringify({ vehicles: o.vehicles, parts: 0 }), o.startDays, o.endDays, o.graceDays],
  );
}

async function liveListing(sellerId: string, shopId: string, ageDays = 0): Promise<string> {
  const r = await db.query(
    `insert into listings (seller_id, shop_id, category_id, title, governorate, price, contact_phone,
                           seller_attestation_version, status, published_at, expires_at, fee_waived_by)
     values ($1, $2, $3, $4, 'Tunis', 1000, '+21620000000', 'v1', 'published',
             now() - make_interval(days => $5), now() + interval '30 days', $1) returning id`,
    [sellerId, shopId, vehicleCat, `Cycle ${randomUUID().slice(0, 6)}`, ageDays],
  );
  return r.rows[0].id;
}

async function order(userId: string, o: {
  kind: "subscription" | "promo"; shopId?: string | null; productId: string; amount: number;
  expected: number; listingId?: string; slug?: string;
}): Promise<string> {
  const { data, error } = await svc.from("payments").insert({
    user_id: userId,
    kind: o.kind,
    provider: "konnect",
    provider_ref: `ref-${randomUUID()}`,
    amount: o.amount,
    status: "pending",
    shop_id: o.shopId ?? null,
    metadata: {
      product_id: o.productId, expected_amount: o.expected,
      ...(o.listingId ? { listing_id: o.listingId } : {}),
      ...(o.slug ? { product_slug: o.slug } : {}),
    },
  }).select("id").single();
  if (error || !data) throw new Error(`order failed: ${error?.message}`);
  return data.id;
}

const confirm = (id: string) => svc.rpc("confirm_payment", { p_payment_id: id, p_source: "webhook", p_verified: { status: "completed" } });
const status = async (id: string) => (await db.query(`select status from listings where id=$1`, [id])).rows[0].status as string;

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  vehicleCat = (await db.query(
    `select id from categories where kind='vehicle' and parent_id is not null and is_active order by sort_order limit 1`,
  )).rows[0].id;
  const p = (await db.query(`select id, price, slug from products where slug in ('plan-starter','plan-business','boost-7j')`)).rows;
  const by = (slug: string) => {
    const row = p.find((x) => x.slug === slug);
    return { id: row.id as string, price: Number(row.price) };
  };
  starter = by("plan-starter");
  business = by("plan-business");
  boost = by("boost-7j");
});

afterAll(async () => {
  for (const s of shops) {
    await db.query(`delete from boosts where shop_id=$1`, [s]);
    await db.query(`delete from listings where shop_id=$1`, [s]);
    await db.query(`delete from subscriptions where shop_id=$1`, [s]);
    await db.query(`delete from payment_events where payment_id in (select id from payments where shop_id=$1)`, [s]);
    await db.query(`delete from payments where shop_id=$1`, [s]);
    await db.query(`delete from shops where id=$1`, [s]);
  }
  for (const u of users) await db.query(`delete from payments where user_id=$1`, [u.id]);
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

// ── Recette 5 ────────────────────────────────────────────────────────────────

describe("recette 5 — a confirmation delivered twice opens one period", () => {
  it("captures once, opens one period, opens the shop, numbers the receipt", async () => {
    const o = await owner();
    const shop = await makeShop(o.id, "draft");
    const pay = await order(o.id, { kind: "subscription", shopId: shop, productId: starter.id, amount: starter.price, expected: starter.price });

    expect((await confirm(pay)).data).toBe("captured");
    expect((await confirm(pay)).data).toBe("already_captured");

    const subs = await db.query(`select limits, round(extract(epoch from ends_at - starts_at)/86400) as days from subscriptions where payment_id=$1`, [pay]);
    expect(subs.rows).toHaveLength(1);
    expect(subs.rows[0]).toMatchObject({ limits: { vehicles: 10, parts: 50 }, days: "30" });
    const events = await db.query(`select outcome from payment_events where payment_id=$1 order by created_at`, [pay]);
    expect(events.rows.map((r) => r.outcome)).toEqual(["captured", "already_captured"]);
    const p = await db.query(`select status, receipt_number from payments where id=$1`, [pay]);
    expect(p.rows[0].status).toBe("captured");
    expect(p.rows[0].receipt_number).toMatch(/^R\d{4}-\d{6}$/);
    expect((await db.query(`select status from shops where id=$1`, [shop])).rows[0].status).toBe("active");
  });

  it("an admin capturing the same receipt twice still opens one period", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    const pay = await order(o.id, { kind: "subscription", shopId: shop, productId: starter.id, amount: starter.price, expected: starter.price });
    await svc.from("payments").update({ status: "captured" }).eq("id", pay).in("status", ["pending", "pending_review"]);
    await svc.from("payments").update({ status: "captured" }).eq("id", pay).in("status", ["pending", "pending_review"]);
    expect((await db.query(`select count(*)::int n from subscriptions where payment_id=$1`, [pay])).rows[0].n).toBe(1);
  });
});

describe("the money check", () => {
  it("refuses to capture less than the order's price", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    const pay = await order(o.id, { kind: "subscription", shopId: shop, productId: business.id, amount: 1, expected: business.price });
    const { error } = await confirm(pay);
    expect(error?.message).toContain("amount_mismatch");
    expect((await db.query(`select status from payments where id=$1`, [pay])).rows[0].status).toBe("pending");
    expect((await db.query(`select count(*)::int n from subscriptions where shop_id=$1`, [shop])).rows[0].n).toBe(0);
  });

  it("does not let a signed-in client create a subscription payment", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    const { error } = await o.client.from("payments").insert({
      user_id: o.id, kind: "subscription", provider: "manual", amount: 1, status: "pending",
      shop_id: shop, metadata: { product_id: business.id },
    });
    expect(error?.code).toBe("42501");
    const promo = await o.client.from("payments").insert({
      user_id: o.id, kind: "promo", provider: "manual", amount: 1, status: "pending", metadata: {},
    });
    expect(promo.error?.code).toBe("42501");
  });
});

describe("recette 6 (database) — an unconfirmed payment opens nothing", () => {
  it("leaves the shop without a period, so it cannot publish", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await order(o.id, { kind: "subscription", shopId: shop, productId: starter.id, amount: starter.price, expected: starter.price });
    expect((await db.query(`select count(*)::int n from subscriptions where shop_id=$1`, [shop])).rows[0].n).toBe(0);
    const draft = await db.query(
      `insert into listings (seller_id, shop_id, category_id, title, governorate, price, contact_phone, seller_attestation_version)
       values ($1,$2,$3,'Sans abonnement','Tunis',1000,'+21620000000','v1') returning id`,
      [o.id, shop, vehicleCat],
    );
    const { error } = await svc.from("listings").update({ status: "pending_review" }).eq("id", draft.rows[0].id);
    expect(error?.message).toContain("subscription_required");
  });
});

describe("an early renewal", () => {
  it("starts when the current period ends — no day is lost", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 10, startDays: -20, endDays: 10, graceDays: 17 });
    const pay = await order(o.id, { kind: "subscription", shopId: shop, productId: starter.id, amount: starter.price, expected: starter.price });
    await confirm(pay);
    const r = await db.query(
      `select round(extract(epoch from s.starts_at - prev.ends_at)) as gap
         from subscriptions s, subscriptions prev
        where s.payment_id = $1 and prev.shop_id = $2 and prev.reason = 'test'`,
      [pay, shop],
    );
    expect(Number(r.rows[0].gap)).toBe(0);
  });
});

// ── Recette 7 ────────────────────────────────────────────────────────────────

describe("recette 7 — the end of a subscription deletes nothing", () => {
  it("grace keeps the annonces up but stops new ones", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 10, startDays: -31, endDays: -1, graceDays: 6 });
    const a = await liveListing(o.id, shop);
    await svc.rpc("expire_subscriptions");
    expect((await db.query(`select status from subscriptions where shop_id=$1`, [shop])).rows[0].status).toBe("grace");
    expect(await status(a)).toBe("published");
  });

  it("after grace the annonces pause — every row is still there — and a new period brings them back", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 10, startDays: -40, endDays: -10, graceDays: -3 });
    const a = await liveListing(o.id, shop, 5);
    const b = await liveListing(o.id, shop, 2);
    const before = (await db.query(`select count(*)::int n from listings where shop_id=$1`, [shop])).rows[0].n;

    const res = await svc.rpc("expire_subscriptions");
    expect(res.error).toBeNull();
    const rows = await db.query(`select status, paused_reason, paused_from from listings where shop_id=$1`, [shop]);
    expect(rows.rows).toHaveLength(before);
    for (const r of rows.rows) {
      expect(r).toMatchObject({ status: "paused", paused_reason: "subscription_expired", paused_from: "published" });
    }

    const pay = await order(o.id, { kind: "subscription", shopId: shop, productId: starter.id, amount: starter.price, expected: starter.price });
    await confirm(pay);
    expect(await status(a)).toBe("published");
    expect(await status(b)).toBe("published");
  });
});

describe("a smaller plan", () => {
  it("pauses the oldest surplus, and the owner swaps which ones stay", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 1, startDays: -1, endDays: 29, graceDays: 36 });
    const oldest = await liveListing(o.id, shop, 9);
    const middle = await liveListing(o.id, shop, 5);
    const newest = await liveListing(o.id, shop, 1);
    // Seeded past the limit by hand (the exemption), then made ordinary
    // annonces again, as if the owner had published them under a bigger plan.
    await db.query(`update listings set fee_waived_by = null where shop_id=$1`, [shop]);

    await svc.rpc("expire_subscriptions");
    expect(await status(oldest)).toBe("paused");
    expect(await status(middle)).toBe("paused");
    expect(await status(newest)).toBe("published");

    // Resuming one while the place is taken is refused by the quota…
    const refused = await svc.rpc("resume_shop_listing", { p_listing: oldest });
    expect(refused.error?.message).toContain("quota_exceeded");
    // …so the owner pauses the newest and resumes the one they prefer.
    expect((await svc.rpc("pause_shop_listing", { p_listing: newest })).data).toBe("paused");
    expect((await svc.rpc("resume_shop_listing", { p_listing: oldest })).data).toBe("resumed");
    expect(await status(oldest)).toBe("published");
    expect(await status(newest)).toBe("paused");
  });
});

// ── Recette 11 ───────────────────────────────────────────────────────────────

describe("recette 11 — a boost lasts 7 days", () => {
  it("sponsors the annonce for 7 days, once per payment, then ends", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 10, startDays: -1, endDays: 29, graceDays: 36 });
    const listing = await liveListing(o.id, shop);
    const pay = await order(o.id, {
      kind: "promo", shopId: shop, productId: boost.id, amount: boost.price, expected: boost.price,
      listingId: listing, slug: "boost-7j",
    });
    await confirm(pay);
    await confirm(pay);

    const b = await db.query(
      `select status, round(extract(epoch from ends_at - starts_at)/86400) as days from boosts where payment_id=$1`, [pay]);
    expect(b.rows).toEqual([{ status: "active", days: "7" }]);
    const l = await db.query(`select sponsored_until > now() + interval '6 days' as sponsored from listings where id=$1`, [listing]);
    expect(l.rows[0].sponsored).toBe(true);

    await db.query(`update boosts set starts_at = now() - interval '8 days', ends_at = now() - interval '1 day' where payment_id=$1`, [pay]);
    await db.query(`update listings set sponsored_until = now() - interval '1 day' where id=$1`, [listing]);
    await svc.rpc("expire_boosts");
    expect((await db.query(`select status from boosts where payment_id=$1`, [pay])).rows[0].status).toBe("expired");
    expect((await db.query(`select sponsored_until from listings where id=$1`, [listing])).rows[0].sponsored_until).toBeNull();
  });
});

describe("end-of-period warnings", () => {
  it("go out once, not every hour", async () => {
    const o = await owner();
    const shop = await makeShop(o.id);
    await period(shop, { vehicles: 10, startDays: -25, endDays: 5, graceDays: 12 });
    await svc.rpc("expire_subscriptions");
    await svc.rpc("expire_subscriptions");
    const n = await db.query(`select count(*)::int n from notifications where user_id=$1 and kind='subscription_ending'`, [o.id]);
    expect(n.rows[0].n).toBe(1);
  });
});
