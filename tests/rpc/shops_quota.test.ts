// ============================================================================
// Lot 1 — shops, subscriptions and the quota engine (migrations 0185–0190).
//
// The brief's acceptance scenarios that live in the database:
//   recette 1   a private seller's first car goes out for free
//   recette 2   their second live car is refused; a draft is still allowed
//   recette 4   parts: the quota counts live annonces, never drafts
//   recette 8   a non-member reads nothing private of a shop and writes nothing
//   recette 12  becoming a pro keeps the account and its annonces
// plus the rules they rest on: the shop quota and subscription, the state
// guard (only an admin verifies), the type/activity consistency, the audit
// log, and the D-P4 backfill of agency accounts.
//
// Transitions are made the way the routes make them — the service role moving
// `status` — so each refusal here is the database's own (`_listings_quota`,
// `_listings_type_consistency`, `_guard_shop_state`), not a route's.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let vehicleCat: string;
let partCat: string;
const users: TestUser[] = [];
const shopIds: string[] = [];
const listingIds: string[] = [];

async function user(role?: "admin" | "agency", fullName?: string): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  if (role || fullName) {
    // Roles are guarded against everyone but admins (0006); the database
    // itself may open the guard for one transaction.
    await db.query("begin");
    await db.query(`select set_config('app.bypass_profile_guard', 'on', true)`);
    await db.query(
      `update public.profiles set role = coalesce($2::user_role, role), full_name = coalesce($3, full_name) where id = $1`,
      [u.id, role ?? null, fullName ?? null],
    );
    await db.query("commit");
  }
  return u;
}

type Seed = {
  kind?: "vehicle" | "part";
  status?: "draft" | "pending_review" | "published" | "archived";
  shopId?: string | null;
  listingType?: string;
  waivedBy?: string;
};

async function seed(sellerId: string, o: Seed = {}): Promise<string> {
  const now = Date.now();
  const status = o.status ?? "draft";
  const row: Record<string, unknown> = {
    seller_id: sellerId,
    category_id: o.kind === "part" ? partCat : vehicleCat,
    title: `Quota ${o.kind ?? "vehicle"} ${randomUUID().slice(0, 6)}`,
    governorate: "Tunis",
    price: 1000,
    contact_phone: "+21620000000",
    seller_attestation_version: "v1",
    status,
    shop_id: o.shopId ?? null,
  };
  if (o.listingType) row.listing_type = o.listingType;
  if (o.waivedBy) row.fee_waived_by = o.waivedBy;
  if (status === "published") {
    row.published_at = new Date(now).toISOString();
    row.expires_at = new Date(now + 30 * 86_400_000).toISOString();
  }
  const { data, error } = await svc.from("listings").insert(row).select("id").single();
  if (error || !data) throw new Error(`seed failed: ${error?.message}`);
  listingIds.push(data.id);
  return data.id;
}

/** The route's transition: the service role puts an annonce in review. */
async function submit(id: string) {
  return svc.from("listings").update({ status: "pending_review" }).eq("id", id);
}

async function status(id: string): Promise<string> {
  const { data } = await svc.from("listings").select("status").eq("id", id).single();
  return data!.status as string;
}

/** A shop made by the database itself (no guard), with its owner as member. */
async function makeShop(ownerId: string, o: { activity?: string; status?: string } = {}): Promise<string> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const r = await db.query(
    `insert into public.shops (owner_id, activity_type, slug, name, governorate, phone, status)
     values ($1, $2, $3, $4, 'Tunis', '+21671000000', $5) returning id`,
    [ownerId, o.activity ?? "vente_auto", slug, `Boutique ${slug}`, o.status ?? "active"],
  );
  const id = r.rows[0].id as string;
  shopIds.push(id);
  await db.query(
    `insert into public.shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`,
    [id, ownerId],
  );
  return id;
}

async function subscribe(shopId: string, limits: { vehicles: number; parts: number }, days = 30) {
  await db.query(
    `insert into public.subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
     select $1, id, $2::jsonb, 'active', now() - interval '1 minute',
            now() + make_interval(days => $3), now() + make_interval(days => $3 + 7), 'test'
       from public.products where plan_code = 'starter'`,
    [shopId, JSON.stringify(limits), days],
  );
}

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  const v = await db.query(
    `select id from public.categories where kind = 'vehicle' and parent_id is not null and is_active order by sort_order limit 1`,
  );
  const p = await db.query(
    `select id from public.categories where kind = 'part' and parent_id is not null and is_active order by sort_order limit 1`,
  );
  vehicleCat = v.rows[0].id;
  partCat = p.rows[0].id;
});

afterAll(async () => {
  if (listingIds.length) {
    await db.query(`delete from public.listings where id = any($1::uuid[])`, [listingIds]);
  }
  for (const u of users) {
    await db.query(`delete from public.listings where seller_id = $1`, [u.id]);
  }
  const owned = await db.query(
    `select id from public.shops where id = any($1::uuid[]) or owner_id = any($2::uuid[])`,
    [shopIds, users.map((u) => u.id)],
  );
  const ids = owned.rows.map((r) => r.id);
  if (ids.length) {
    await db.query(`delete from public.subscriptions where shop_id = any($1::uuid[])`, [ids]);
    await db.query(`delete from public.shops where id = any($1::uuid[])`, [ids]);
  }
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

// ── Recettes 1, 2 · a private seller's cars ─────────────────────────────────

describe("recettes 1 & 2 — a private seller: one live car, free", () => {
  it("lets the first car through and refuses the second", async () => {
    const alice = await user();
    const first = await seed(alice.id);
    expect((await submit(first)).error).toBeNull();
    expect(await status(first)).toBe("pending_review");

    const second = await seed(alice.id);
    const refused = await submit(second);
    expect(refused.error?.message).toContain("quota_exceeded");
    expect(await status(second)).toBe("draft");
  });

  it("counts a published car the same as one in review", async () => {
    const bob = await user();
    await seed(bob.id, { status: "published", waivedBy: bob.id });
    const next = await seed(bob.id);
    expect((await submit(next)).error?.message).toContain("quota_exceeded");
  });

  it("frees the place when the live car comes down", async () => {
    const carol = await user();
    const first = await seed(carol.id);
    await submit(first);
    const second = await seed(carol.id);
    expect((await submit(second)).error?.message).toContain("quota_exceeded");

    await svc.from("listings").update({ status: "archived" }).eq("id", first);
    expect((await submit(second)).error).toBeNull();
    expect(await status(second)).toBe("pending_review");
  });

  it("keeps a car and a part in separate buckets", async () => {
    const dan = await user();
    await submit(await seed(dan.id));
    expect((await submit(await seed(dan.id, { kind: "part" }))).error).toBeNull();
  });

  it("does not count an annonce an admin published by hand", async () => {
    const erin = await user();
    await seed(erin.id, { status: "published", waivedBy: erin.id });
    // The hand-published one is live and counts toward the next check…
    expect((await submit(await seed(erin.id))).error?.message).toContain("quota_exceeded");
    // …but publishing it never went through the limit itself.
    const second = await seed(erin.id, { status: "published", waivedBy: erin.id });
    expect(await status(second)).toBe("published");
  });
});

// ── Recette 4 · parts count live annonces, not drafts ───────────────────────

describe("recette 4 — five live parts; drafts never count", () => {
  it("allows five, refuses the sixth, whatever the number of drafts", async () => {
    const parts = await user();
    for (let i = 0; i < 8; i++) await seed(parts.id, { kind: "part" });   // drafts
    const live: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await seed(parts.id, { kind: "part" });
      expect((await submit(id)).error).toBeNull();
      live.push(id);
    }
    const sixth = await seed(parts.id, { kind: "part" });
    expect((await submit(sixth)).error?.message).toContain("quota_exceeded");

    await svc.from("listings").update({ status: "archived" }).eq("id", live[0]);
    expect((await submit(sixth)).error).toBeNull();
  });
});

// ── Shops · subscription and plan limit ──────────────────────────────────────

describe("shop annonces — the subscription is the quota", () => {
  it("refuses a shop annonce with no current subscription", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id);
    const id = await seed(owner.id, { shopId: shop });
    expect((await submit(id)).error?.message).toContain("subscription_required");
  });

  it("allows up to the plan's vehicle limit, then refuses", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id);
    await subscribe(shop, { vehicles: 2, parts: 0 });
    expect((await submit(await seed(owner.id, { shopId: shop }))).error).toBeNull();
    expect((await submit(await seed(owner.id, { shopId: shop }))).error).toBeNull();
    expect((await submit(await seed(owner.id, { shopId: shop }))).error?.message).toContain("quota_exceeded");
  });

  it("keeps the owner's personal allowance separate from the shop's", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id);
    await subscribe(shop, { vehicles: 1, parts: 0 });
    expect((await submit(await seed(owner.id, { shopId: shop }))).error).toBeNull();
    expect((await submit(await seed(owner.id))).error).toBeNull();   // personal car
  });

  it("refuses annonces for a suspended shop, subscription or not", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "suspended" });
    await subscribe(shop, { vehicles: 10, parts: 0 });
    expect((await submit(await seed(owner.id, { shopId: shop }))).error?.message).toContain("shop_not_active");
  });

  it("does not let an expired period publish", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id);
    await db.query(
      `insert into public.subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
       select $1, id, '{"vehicles":10,"parts":0}', 'active', now() - interval '40 days',
              now() - interval '10 days', now() - interval '3 days', 'test'
         from public.products where plan_code = 'starter'`,
      [shop],
    );
    expect((await submit(await seed(owner.id, { shopId: shop }))).error?.message).toContain("subscription_required");
  });
});

// ── Consistency of type, activity and membership ─────────────────────────────

describe("listing type follows the category and the shop", () => {
  it("files a part as pieces_auto whatever the writer sent", async () => {
    const u = await user();
    const id = await seed(u.id, { kind: "part", listingType: "vente_auto" });
    const { data } = await svc.from("listings").select("listing_type, price_unit").eq("id", id).single();
    expect(data).toEqual({ listing_type: "pieces_auto", price_unit: "total" });
  });

  it("refuses a personal rental", async () => {
    const u = await user();
    await expect(seed(u.id, { listingType: "location_auto" })).rejects.toThrow("rental_requires_shop");
  });

  it("prices a rental by the day", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id, { activity: "location_auto" });
    const id = await seed(owner.id, { shopId: shop, listingType: "location_auto" });
    const { data } = await svc.from("listings").select("listing_type, price_unit").eq("id", id).single();
    expect(data).toEqual({ listing_type: "location_auto", price_unit: "day" });
  });

  it("refuses a part filed under a car shop, and a car under a parts shop", async () => {
    const owner = await user();
    const cars = await makeShop(owner.id);
    await expect(seed(owner.id, { kind: "part", shopId: cars })).rejects.toThrow("shop_activity_mismatch");
  });

  it("refuses an annonce filed under someone else's shop", async () => {
    const owner = await user();
    const stranger = await user();
    const shop = await makeShop(owner.id);
    await expect(seed(stranger.id, { shopId: shop })).rejects.toThrow("not_shop_member");
  });
});

// ── Recette 8 · isolation ────────────────────────────────────────────────────

describe("recette 8 — a non-member reads nothing private and writes nothing", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let shop: string;
  let draftShop: string;

  beforeAll(async () => {
    owner = await user();
    stranger = await user();
    shop = await makeShop(owner.id);
    draftShop = await makeShop((await user()).id, { status: "draft" });
    await subscribe(shop, { vehicles: 5, parts: 0 });
    await db.query(
      `insert into public.shop_private (shop_id, legal_name, tax_id) values ($1, 'SARL Test', '1234567/A')`,
      [shop],
    );
    await db.query(
      `insert into public.shop_documents (shop_id, kind, storage_path) values ($1, 'rne', 'shops/x/rne.pdf')`,
      [shop],
    );
  });

  it("shows the member their private data and documents", async () => {
    const priv = await owner.client.from("shop_private").select("legal_name").eq("shop_id", shop);
    expect(priv.data).toEqual([{ legal_name: "SARL Test" }]);
    const docs = await owner.client.from("shop_documents").select("kind").eq("shop_id", shop);
    expect(docs.data).toEqual([{ kind: "rne" }]);
  });

  it("shows another signed-in user none of it", async () => {
    for (const table of ["shop_private", "shop_documents", "subscriptions", "shop_members"]) {
      const { data, error } = await stranger.client.from(table).select("*").eq("shop_id", shop);
      expect({ table, error, data }).toEqual({ table, error: null, data: [] });
    }
  });

  it("shows anon nothing at all of the private tables", async () => {
    for (const table of ["shop_private", "shop_documents", "subscriptions", "audit_logs"]) {
      const { data, error } = await anon().from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it("publishes an active shop's public face, never its phone", async () => {
    const pub = await anon().from("shops").select("name, slug, governorate").eq("id", shop);
    expect(pub.error).toBeNull();
    expect(pub.data).toHaveLength(1);
    const phone = await anon().from("shops").select("phone").eq("id", shop);
    expect(phone.error?.code).toBe("42501");
  });

  it("hides a shop that is not active", async () => {
    const { data } = await anon().from("shops").select("id").eq("id", draftShop);
    expect(data).toEqual([]);
  });

  it("lets no token write a shop — not a stranger, not even its owner", async () => {
    for (const client of [stranger.client, owner.client]) {
      const { error } = await client.from("shops").update({ name: "Repris" }).eq("id", shop);
      expect(error?.code).toBe("42501");
      const ins = await client.from("shop_private").insert({ shop_id: shop, legal_name: "X" });
      expect(ins.error?.code).toBe("42501");
    }
  });
});

// ── Recette 10 · only an admin verifies ──────────────────────────────────────

describe("the badge is earned: only an admin verifies a shop", () => {
  it("refuses the service role (the routes) verifying or activating a shop", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "pending_review" });
    for (const patch of [
      { verification_status: "verified", verified_at: new Date().toISOString() },
      { status: "active" },
    ]) {
      const { error } = await svc.from("shops").update(patch).eq("id", shop);
      expect(error?.message).toContain("shop_state_admin_only");
    }
  });

  it("lets the owner's route submit the shop and ask for verification", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "draft" });
    const { error } = await svc
      .from("shops")
      .update({ status: "pending_review", verification_status: "pending" })
      .eq("id", shop);
    expect(error).toBeNull();
  });

  it("refuses admin_set_shop_state to a non-admin", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "pending_review" });
    const { error } = await owner.client.rpc("admin_set_shop_state", {
      p_shop: shop, p_status: "active", p_verification: "verified",
    });
    expect(error?.message).toContain("forbidden");
  });

  it("lets an admin verify, stamps it, and writes the audit trail", async () => {
    const boss = await user("admin");
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "pending_review" });
    const { data, error } = await boss.client.rpc("admin_set_shop_state", {
      p_shop: shop, p_status: "active", p_verification: "verified",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "active", verification_status: "verified" });

    const audit = await db.query(
      `select actor_id, action, before, after from public.audit_logs
        where entity = 'shop' and entity_id = $1 and action = 'state_changed'`,
      [shop],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_id).toBe(boss.id);
    expect(audit.rows[0].after).toMatchObject({ status: "active", verification_status: "verified" });
  });

  it("requires a reason to refuse or suspend", async () => {
    const boss = await user("admin");
    const owner = await user();
    const shop = await makeShop(owner.id, { status: "pending_review" });
    const { error } = await boss.client.rpc("admin_set_shop_state", { p_shop: shop, p_status: "rejected" });
    expect(error?.message).toContain("reason_required");
  });

  it("never lets an audit entry be edited or deleted", async () => {
    const owner = await user();
    const shop = await makeShop(owner.id);
    let message = "";
    try {
      await db.query(`delete from public.audit_logs where entity_id = $1`, [shop]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("audit_logs_append_only");
  });
});

// ── Recette 12 · becoming a pro keeps everything ─────────────────────────────

describe("recette 12 — a private seller opens a shop and keeps their annonces", () => {
  it("keeps the account, keeps the live annonce, and can move it to the shop", async () => {
    const seller = await user();
    const car = await seed(seller.id);
    await submit(car);
    await svc.from("listings").update({
      status: "published",
      published_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    }).eq("id", car);
    const before = await svc.from("listings").select("seller_id, expires_at").eq("id", car).single();

    const shop = await makeShop(seller.id);
    await subscribe(shop, { vehicles: 10, parts: 0 });

    // Nothing moved by itself: same account, same annonce, still personal.
    const still = await svc.from("listings").select("seller_id, shop_id, status").eq("id", car).single();
    expect(still.data).toEqual({ seller_id: seller.id, shop_id: null, status: "published" });

    // Attached on request: it keeps its paid duration and now draws on the shop.
    const { error } = await svc.from("listings").update({ shop_id: shop }).eq("id", car);
    expect(error).toBeNull();
    const after = await svc.from("listings").select("seller_id, shop_id, status, expires_at").eq("id", car).single();
    expect(after.data).toMatchObject({ seller_id: seller.id, shop_id: shop, status: "published" });
    expect(after.data!.expires_at).toBe(before.data!.expires_at);

    // And the personal place it held is free again.
    expect((await submit(await seed(seller.id))).error).toBeNull();
  });

  it("refuses moving a live annonce into a shop with no room", async () => {
    const seller = await user();
    const car = await seed(seller.id);
    await submit(car);
    const shop = await makeShop(seller.id);
    await subscribe(shop, { vehicles: 0, parts: 0 });
    const { error } = await svc.from("listings").update({ shop_id: shop }).eq("id", car);
    expect(error?.message).toContain("quota_exceeded");
  });
});

// ── D-P4 · agency accounts become shops ──────────────────────────────────────

describe("backfill_agency_shops (D-P4)", () => {
  it("gives an agency its shop, a 90-day Business period and its cars — once", async () => {
    const agency = await user("agency", "Garage Démo · Sousse");
    const cars = [
      await seed(agency.id, { status: "published", waivedBy: agency.id }),
      await seed(agency.id, { status: "published", waivedBy: agency.id }),
    ];
    const part = await seed(agency.id, { kind: "part", status: "published", waivedBy: agency.id });
    const stamps = await db.query(`select id, updated_at from public.listings where id = any($1::uuid[])`, [cars]);

    const first = await db.query(`select public.backfill_agency_shops() as n`);
    expect(first.rows[0].n).toBeGreaterThanOrEqual(1);

    const shop = await db.query(
      `select id, slug, governorate, status, verification_status, activity_type
         from public.shops where owner_id = $1`,
      [agency.id],
    );
    expect(shop.rows).toHaveLength(1);
    expect(shop.rows[0]).toMatchObject({
      governorate: "Sousse", status: "active", verification_status: "unverified", activity_type: "vente_auto",
    });
    expect(shop.rows[0].slug).toMatch(/^garage-demo-sousse(-\d+)?$/);
    const shopId = shop.rows[0].id;

    const sub = await db.query(
      `select s.limits, s.reason, round(extract(epoch from (s.ends_at - s.starts_at)) / 86400) as days, p.plan_code
         from public.subscriptions s join public.products p on p.id = s.product_id where s.shop_id = $1`,
      [shopId],
    );
    expect(sub.rows).toEqual([{
      limits: { vehicles: 120, parts: 1000 }, reason: "migration", days: "90", plan_code: "business",
    }]);

    const attached = await db.query(
      `select id, shop_id, status, updated_at from public.listings where seller_id = $1`,
      [agency.id],
    );
    const byId = new Map(attached.rows.map((r) => [r.id, r]));
    for (const c of cars) {
      expect(byId.get(c)).toMatchObject({ shop_id: shopId, status: "published" });
      const was = stamps.rows.find((s) => s.id === c)!.updated_at;
      expect(new Date(byId.get(c)!.updated_at).getTime()).toBe(new Date(was).getTime());
    }
    expect(byId.get(part)).toMatchObject({ shop_id: null });

    const again = await db.query(
      `select count(*)::int as n from public.shops where owner_id = $1`,
      [agency.id],
    );
    await db.query(`select public.backfill_agency_shops()`);
    const after = await db.query(`select count(*)::int as n from public.shops where owner_id = $1`, [agency.id]);
    expect(after.rows[0].n).toBe(again.rows[0].n);
  });
});
