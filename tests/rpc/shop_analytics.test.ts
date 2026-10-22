// ============================================================================
// Lot 5 — shop statistics, the audit trail, and the admin's doors (0193).
//
//   recette 11 (statistiques)  views and clicks are counted once a day per
//               visitor, the shop's own members are not counted, and the owner
//               reads them per day and per annonce — no « sale » anywhere
//   recette 12  admin decisions on a shop leave a durable trace (audit_logs)
// and the doors: only an admin reviews a document or gives a period, a refusal
// needs a reason, a given period follows the paid rules.
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
let boss: TestUser;
const users: TestUser[] = [];
const shops: string[] = [];

async function user(): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  return u;
}

async function makeShop(ownerId: string, status = "active"): Promise<string> {
  const r = await db.query(
    `insert into shops (owner_id, activity_type, slug, name, governorate, status)
     values ($1, 'vente_auto', $2, 'Boutique stats', 'Tunis', $3) returning id`,
    [ownerId, `stat-${randomUUID().slice(0, 8)}`, status],
  );
  await db.query(`insert into shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`, [r.rows[0].id, ownerId]);
  shops.push(r.rows[0].id);
  return r.rows[0].id;
}

async function listing(sellerId: string, shopId: string | null): Promise<string> {
  if (shopId) {
    // A shop publishes only during a period (0189): give it one, once.
    await db.query(
      `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
       select $1, p.id, '{"vehicles": 50, "parts": 50}', 'active', now() - interval '1 day',
              now() + interval '20 days', now() + interval '27 days', 'test'
         from products p
        where p.slug = 'plan-starter'
          and not exists (select 1 from subscriptions s where s.shop_id = $1)`,
      [shopId],
    );
  }
  const r = await db.query(
    `insert into listings (seller_id, shop_id, category_id, title, governorate, price, contact_phone,
                           seller_attestation_version, status, published_at, expires_at)
     values ($1, $2, $3, $4, 'Tunis', 1000, '+21620000000', 'v1', 'published', now(), now() + interval '30 days')
     returning id`,
    [sellerId, shopId, vehicleCat, `Stats ${randomUUID().slice(0, 6)}`],
  );
  return r.rows[0].id;
}

const events = async (shopId: string, kind?: string) =>
  Number((await db.query(
    `select count(*) n from shop_lead_events where shop_id = $1 ${kind ? "and kind = $2" : ""}`,
    kind ? [shopId, kind] : [shopId],
  )).rows[0].n);

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  vehicleCat = (await db.query(
    `select id from categories where kind='vehicle' and parent_id is not null and is_active order by sort_order limit 1`,
  )).rows[0].id;
  // An admin the way the console sees one: profiles.role = 'admin'. Signing up
  // with role=admin in the metadata does not make one (0066), so set it the
  // trusted way, through the guard's bypass, in one transaction.
  boss = await user();
  await db.query("begin");
  await db.query(`select set_config('app.bypass_profile_guard', 'on', true)`);
  await db.query(`update profiles set role = 'admin' where id = $1`, [boss.id]);
  await db.query("commit");
});

afterAll(async () => {
  for (const s of shops) {
    await db.query(`delete from listings where shop_id=$1`, [s]);
    await db.query(`delete from subscriptions where shop_id=$1`, [s]);
    await db.query(`delete from shops where id=$1`, [s]);
  }
  for (const u of users) await db.query(`delete from listings where seller_id=$1`, [u.id]);
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

// ── Recording ───────────────────────────────────────────────────────────────

describe("statistics — once a day per visitor, never the shop's own members", () => {
  it("counts a storefront visit once a day, a second visitor again, a member never", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const rec = (key: string, u: string | null = null) =>
      svc.rpc("record_shop_event", { p_shop: shop, p_listing: null, p_kind: "shop_view", p_viewer_key: key, p_user: u });

    expect((await rec("a:visitor-1")).data).toBe(true);
    expect((await rec("a:visitor-1")).data).toBe(false);      // a refresh
    expect((await rec("a:visitor-2")).data).toBe(true);
    expect((await rec(`u:${o.id}`, o.id)).data).toBe(false);  // the owner
    expect(await events(shop, "shop_view")).toBe(2);

    const raw = (await db.query(`select viewer_hash from shop_lead_events where shop_id=$1`, [shop])).rows;
    expect(raw.every((r) => /^[0-9a-f]{32}$/.test(r.viewer_hash))).toBe(true);   // never the key itself
  });

  it("an annonce of a shop leaves a daily listing_view; a private annonce and the seller's own visit do not", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const shopListing = await listing(o.id, shop);
    const priv = await user();
    const privListing = await listing(priv.id, null);

    await svc.rpc("record_listing_view", { p_listing: shopListing, p_viewer_key: "a:reader-1", p_user: null });
    await svc.rpc("record_listing_view", { p_listing: shopListing, p_viewer_key: "a:reader-1", p_user: null });
    await svc.rpc("record_listing_view", { p_listing: shopListing, p_viewer_key: `u:${o.id}`, p_user: o.id });
    await svc.rpc("record_listing_view", { p_listing: privListing, p_viewer_key: "a:reader-1", p_user: null });

    expect(await events(shop, "listing_view")).toBe(1);
    expect(Number((await db.query(`select view_count from listings where id=$1`, [shopListing])).rows[0].view_count)).toBe(1);
    expect(Number((await db.query(`select count(*) n from shop_lead_events where listing_id=$1`, [privListing])).rows[0].n)).toBe(0);
  });

  it("is invisible to clients: no read, no write, no stats", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const read = await o.client.from("shop_lead_events").select("id").eq("shop_id", shop);
    expect(read.error ?? (read.data ?? []).length === 0).toBeTruthy();
    const write = await o.client.rpc("record_shop_event", { p_shop: shop, p_listing: null, p_kind: "shop_view", p_viewer_key: "x" });
    expect(write.error).not.toBeNull();
    const stats = await o.client.rpc("shop_stats", { p_shop: shop, p_days: 30 });
    expect(stats.error).not.toBeNull();
  });
});

describe("shop_stats — per day and per annonce, sales never", () => {
  it("returns every day of the window, events and annonce reveals, and one line per annonce", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const l1 = await listing(o.id, shop);
    await svc.rpc("record_shop_event", { p_shop: shop, p_listing: null, p_kind: "shop_view", p_viewer_key: "a:v1" });
    await svc.rpc("record_shop_event", { p_shop: shop, p_listing: null, p_kind: "phone_reveal", p_viewer_key: "a:v1" });
    await svc.rpc("record_shop_event", { p_shop: shop, p_listing: null, p_kind: "whatsapp_click", p_viewer_key: "a:v2" });
    await svc.rpc("record_listing_view", { p_listing: l1, p_viewer_key: "a:v1", p_user: null });
    await db.query(`insert into contact_reveals (listing_id, ip_hash) values ($1, 'ip-a'), ($1, 'ip-a'), ($1, 'ip-b')`, [l1]);
    // The owner looking at their own number is not a lead.
    await db.query(`insert into contact_reveals (listing_id, user_id) values ($1, $2)`, [l1, o.id]);

    const { data, error } = await svc.rpc("shop_stats", { p_shop: shop, p_days: 30 });
    expect(error).toBeNull();
    expect(data.daily).toHaveLength(30);
    const today = data.daily.at(-1);
    expect(today).toMatchObject({ shop_views: 1, listing_views: 1, whatsapp_clicks: 1, phone_reveals: 1 + 2 });
    expect(data.daily.slice(0, -1).every((d: { shop_views: number }) => d.shop_views === 0)).toBe(true);
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0]).toMatchObject({ id: l1, views: 1, total_views: 1 });
    expect(data.listings[0].reveals).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(data)).not.toMatch(/sale|vente|sold_count/i);
  });

  it("keeps the window between 1 and 366 days", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    expect((await svc.rpc("shop_stats", { p_shop: shop, p_days: 0 })).data.daily).toHaveLength(1);
    expect((await svc.rpc("shop_stats", { p_shop: shop, p_days: 5000 })).data.daily).toHaveLength(366);
  });
});

// ── Recette 12: the trace ────────────────────────────────────────────────────

describe("recette 12 — admin decisions leave a durable trace", () => {
  it("records a document's submission and review, with who decided and why", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const doc = (await db.query(
      `insert into shop_documents (shop_id, kind, storage_path) values ($1, 'rne', $2) returning id`,
      [shop, `shops/${shop}/rne.pdf`],
    )).rows[0].id;

    // Not an admin: refused.
    const no = await o.client.rpc("admin_review_shop_document", { p_doc: doc, p_status: "accepted" });
    expect(no.error?.message).toMatch(/forbidden/);
    // A refusal without a reason: refused.
    const bare = await boss.client.rpc("admin_review_shop_document", { p_doc: doc, p_status: "rejected" });
    expect(bare.error?.message).toMatch(/reason_required/);
    // The service key is not an admin either.
    expect((await svc.rpc("admin_review_shop_document", { p_doc: doc, p_status: "accepted" })).error).not.toBeNull();

    const yes = await boss.client.rpc("admin_review_shop_document", { p_doc: doc, p_status: "rejected", p_note: "Illisible" });
    expect(yes.error).toBeNull();
    expect(yes.data).toBe(shop);
    const row = (await db.query(`select status, reviewed_by, note from shop_documents where id=$1`, [doc])).rows[0];
    expect(row).toMatchObject({ status: "rejected", reviewed_by: boss.id, note: "Illisible" });

    const trail = (await db.query(
      `select action, actor_id, reason, after->>'shop_id' shop from audit_logs where entity='shop_document' and entity_id=$1 order by created_at`,
      [doc],
    )).rows;
    expect(trail.map((t) => t.action)).toEqual(["submitted", "reviewed"]);
    expect(trail[1]).toMatchObject({ actor_id: boss.id, reason: "Illisible", shop });
  });

  it("records the status of a shop's annonces, not of private ones", async () => {
    const o = await user();
    const shop = await makeShop(o.id);
    const l = await listing(o.id, shop);
    const priv = await user();
    const p = await listing(priv.id, null);
    await db.query(`update listings set status='archived' where id = any($1)`, [[l, p]]);
    const n = async (id: string) =>
      Number((await db.query(`select count(*) n from audit_logs where entity='listing' and entity_id=$1`, [id])).rows[0].n);
    expect(await n(l)).toBe(1);
    expect(await n(p)).toBe(0);
  });

  it("cannot be rewritten", async () => {
    const r = await db.query(`select id from audit_logs order by created_at desc limit 1`);
    await expect(db.query(`delete from audit_logs where id=$1`, [r.rows[0].id])).rejects.toThrow();
  });
});

// ── A period given by an admin ──────────────────────────────────────────────

describe("admin_grant_subscription — a given period follows the paid rules", () => {
  it("only an admin, only with a reason; it opens a draft shop and stacks after the current period", async () => {
    const o = await user();
    const shop = await makeShop(o.id, "draft");

    expect((await o.client.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "pro", p_days: 30, p_reason: "x" })).error?.message)
      .toMatch(/forbidden/);
    expect((await svc.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "pro", p_days: 30, p_reason: "x" })).error)
      .not.toBeNull();
    expect((await boss.client.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "pro", p_days: 30, p_reason: " " })).error?.message)
      .toMatch(/reason_required/);
    expect((await boss.client.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "pro", p_days: 0, p_reason: "geste" })).error?.message)
      .toMatch(/invalid_days/);

    const first = await boss.client.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "pro", p_days: 30, p_reason: "Lancement" });
    expect(first.error).toBeNull();
    const second = await boss.client.rpc("admin_grant_subscription", { p_shop: shop, p_plan_code: "business", p_days: 10, p_reason: "Virement reçu en agence" });
    expect(second.error).toBeNull();

    const subs = (await db.query(
      `select id, starts_at, ends_at, grace_ends_at, limits, granted_by, reason, payment_id
         from subscriptions where shop_id=$1 order by starts_at`, [shop])).rows;
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({ granted_by: boss.id, reason: "Lancement", payment_id: null });
    expect(subs[0].limits.vehicles).toBe(40);
    expect(Math.round((subs[0].ends_at - subs[0].starts_at) / 86_400_000)).toBe(30);
    expect(+subs[1].starts_at).toBe(+subs[0].ends_at);
    expect((await db.query(`select status from shops where id=$1`, [shop])).rows[0].status).toBe("active");

    const trail = (await db.query(
      `select actor_id from audit_logs where entity='subscription' and entity_id = any($1)`, [subs.map((s) => s.id)])).rows;
    expect(trail).toHaveLength(2);
    expect(trail.every((t) => t.actor_id === boss.id)).toBe(true);
  });
});
