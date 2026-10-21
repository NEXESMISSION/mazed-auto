// ============================================================================
// Lot 0 regression suite — the holes closed by 0183 and 0184 stay closed.
//
// Every attack here goes through the REST API with a real token, exactly as a
// seller (or a scraper holding the anon key from the app bundle) would, not
// through the web routes: the routes were never the problem, the table was.
//
//   0183  a seller's own JWT cannot write status / dates / ranking / money
//         columns, cannot edit an annonce once it is in review or live, cannot
//         re-photograph a live annonce; anon can read fitments again; a banned
//         seller cannot be moved into a submission state.
//   0184  reveal_listing_contact is rate-limited per client IP (a forged
//         X-Forwarded-For does not buy a fresh bucket), refuses hidden numbers,
//         and leaves a row in contact_reveals.
// ============================================================================
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, anon, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let seller: TestUser;
let other: TestUser;
let categoryId: string;
const listingIds: string[] = [];

async function seedListing(
  sellerId: string,
  status: "draft" | "rejected" | "pending_payment" | "pending_review" | "published",
  extra: Record<string, unknown> = {},
): Promise<string> {
  const now = new Date();
  const row: Record<string, unknown> = {
    seller_id: sellerId,
    category_id: categoryId,
    title: `Lockdown ${status} ${randomUUID().slice(0, 6)}`,
    governorate: "Tunis",
    price: 25000,
    contact_name: "Vendeur Test",
    contact_phone: "+21620000000",
    show_phone: true,
    status,
    ...extra,
  };
  if (status !== "draft") {
    row.seller_attestation_version = "v1";
    // Fixtures stand for annonces published by hand, so the live-annonce quota
    // (0189, tested in shops_quota.test.ts) does not cap how many this suite
    // seeds for one seller.
    row.fee_waived_by = sellerId;
  }
  if (status === "published") {
    row.published_at = now.toISOString();
    row.expires_at = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  }
  const { data, error } = await svc.from("listings").insert(row).select("id").single();
  if (error || !data) throw new Error(`seedListing failed: ${error?.message}`);
  listingIds.push(data.id);
  return data.id;
}

async function readListing(id: string) {
  const { data, error } = await svc.from("listings").select("*").eq("id", id).single();
  if (error) throw new Error(`readListing failed: ${error.message}`);
  return data as Record<string, unknown>;
}

async function clearRevealBuckets() {
  await db.query(`delete from public.rate_limits where key like 'reveal-rpc:%'`);
}

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();

  const cat = await db.query(
    `select id from public.categories
      where kind = 'vehicle' and parent_id is not null and is_active
      order by sort_order limit 1`,
  );
  categoryId = cat.rows[0].id;

  seller = await createUser(svc);
  other = await createUser(svc);
});

afterAll(async () => {
  if (listingIds.length) {
    await db.query(`delete from public.contact_reveals where listing_id = any($1::uuid[])`, [listingIds]);
    await db.query(`delete from public.listing_photos where listing_id = any($1::uuid[])`, [listingIds]);
    await db.query(`delete from public.listing_fitments where listing_id = any($1::uuid[])`, [listingIds]);
    await db.query(`delete from public.listings where id = any($1::uuid[])`, [listingIds]);
  }
  await clearRevealBuckets().catch(() => {});
  await deleteUsers(svc, [seller, other].filter(Boolean));
  await db?.end().catch(() => {});
});

// ── 0183 · column grants ────────────────────────────────────────────────────

describe("0183 — the seller's token writes content, never state", () => {
  it("has no INSERT/UPDATE grant on any state, date, ranking or money column", async () => {
    const closed = [
      "status", "expires_at", "published_at", "boost", "boost_until",
      "featured_rank", "featured_until", "fee_waived_reason", "fee_waived_by",
      "seller_credit_id", "fee_payment_id", "reviewed_by", "reviewed_at",
      "rejection_reason", "view_count", "contact_reveal_count", "renewed_count",
      "reference",
    ];
    for (const col of closed) {
      for (const role of ["anon", "authenticated"]) {
        for (const priv of ["insert", "update"]) {
          const res = await db.query(
            `select has_column_privilege($1, 'public.listings', $2, $3) as ok`,
            [role, col, priv],
          );
          expect({ role, col, priv, ok: res.rows[0].ok }).toEqual({ role, col, priv, ok: false });
        }
      }
    }
    const content = await db.query(
      `select has_column_privilege('authenticated', 'public.listings', 'title', 'update') as ok`,
    );
    expect(content.rows[0].ok).toBe(true);
  });

  it("lets a seller create a draft without naming its status", async () => {
    const { data, error } = await seller.client
      .from("listings")
      .insert({
        seller_id: seller.id,
        category_id: categoryId,
        title: "Brouillon via REST",
        governorate: "Sfax",
        price: 12000,
      })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe("draft");
    listingIds.push(data!.id);
  });

  it("refuses a seller inserting straight into review", async () => {
    const { error } = await seller.client.from("listings").insert({
      seller_id: seller.id,
      category_id: categoryId,
      title: "Saute le paiement",
      governorate: "Sfax",
      status: "pending_review",
      seller_attestation_version: "v1",
    });
    expect(error?.code).toBe("42501");
  });

  it("refuses a seller sending their own draft to review without paying", async () => {
    const id = await seedListing(seller.id, "draft", { seller_attestation_version: "v1" });
    const { error } = await seller.client
      .from("listings")
      .update({ status: "pending_review" })
      .eq("id", id);
    expect(error?.code).toBe("42501");
    expect((await readListing(id)).status).toBe("draft");
  });

  it("refuses a seller pinning, boosting or extending their live annonce", async () => {
    const id = await seedListing(seller.id, "published");
    const before = await readListing(id);
    const far = new Date(Date.now() + 5 * 365 * 86_400_000).toISOString();
    for (const patch of [
      { featured_rank: 1, featured_until: far },
      { boost: 100 },
      { expires_at: far },
      { contact_reveal_count: 9999 },
      { fee_waived_reason: "welcome" },
    ]) {
      const { error } = await seller.client.from("listings").update(patch).eq("id", id);
      expect(error?.code).toBe("42501");
    }
    const after = await readListing(id);
    expect(after.featured_rank).toBe(before.featured_rank);
    expect(after.boost).toBe(before.boost);
    expect(after.expires_at).toBe(before.expires_at);
  });

  it("still lets a seller edit the content of a draft", async () => {
    const id = await seedListing(seller.id, "draft");
    const { error } = await seller.client
      .from("listings")
      .update({ title: "Titre corrigé", price: 19000 })
      .eq("id", id);
    expect(error).toBeNull();
    const row = await readListing(id);
    expect(row.title).toBe("Titre corrigé");
    expect(Number(row.price)).toBe(19000);
  });

  it("ignores a seller's content edit once the annonce is in review or live", async () => {
    for (const status of ["pending_review", "published"] as const) {
      const id = await seedListing(seller.id, status);
      const before = await readListing(id);
      const { data } = await seller.client
        .from("listings")
        .update({ title: "Modifié après modération" })
        .eq("id", id)
        .select("id");
      expect(data ?? []).toHaveLength(0);
      expect((await readListing(id)).title).toBe(before.title);
    }
  });

  it("does not let one seller touch another seller's draft", async () => {
    const id = await seedListing(other.id, "draft");
    const before = await readListing(id);
    const { data } = await seller.client
      .from("listings")
      .update({ title: "Pas à moi" })
      .eq("id", id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    expect((await readListing(id)).title).toBe(before.title);
  });
});

// ── 0183 · the publish guard is real ────────────────────────────────────────

describe("0183 — _listings_guard_publish refuses a non-admin token", () => {
  it("blocks a seller publishing their own draft even with the pre-0183 grant and policy", async () => {
    const id = await seedListing(seller.id, "draft");
    // Put back exactly what production had before 0183 — table-level UPDATE
    // for authenticated and an owner policy that ignores status — so the
    // guard is the only thing left standing. Rolled back whatever happens.
    // Before 0183 this very statement succeeded: the guard tested
    // `current_user`, which is the owner inside a SECURITY DEFINER function.
    await db.query("begin");
    try {
      await db.query("grant update on public.listings to authenticated");
      await db.query("drop policy listings_owner_update on public.listings");
      await db.query(
        `create policy listings_owner_update on public.listings for update
           using (seller_id = auth.uid()) with check (seller_id = auth.uid())`,
      );
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: seller.id, role: "authenticated" }),
      ]);
      let message = "";
      try {
        await db.query(
          `update public.listings
              set status = 'published', published_at = now(),
                  expires_at = now() + interval '30 days',
                  seller_attestation_version = 'v1', featured_rank = 1
            where id = $1`,
          [id],
        );
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain("publication_requires_payment");
    } finally {
      await db.query("rollback");
    }
    expect((await readListing(id)).status).toBe("draft");
  });

  it("still lets the service role publish (the paid / admin path)", async () => {
    const id = await seedListing(seller.id, "pending_review");
    const now = Date.now();
    const { error } = await svc
      .from("listings")
      .update({
        status: "published",
        published_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * 86_400_000).toISOString(),
      })
      .eq("id", id);
    expect(error).toBeNull();
    expect((await readListing(id)).status).toBe("published");
  });
});

// ── 0183 · photos and fitments ──────────────────────────────────────────────

describe("0183 — photos and fitments follow the annonce's status", () => {
  it("lets a seller add a photo to a draft but not to a live annonce", async () => {
    const draft = await seedListing(seller.id, "draft");
    const live = await seedListing(seller.id, "published");

    const ok = await seller.client
      .from("listing_photos")
      .insert({ listing_id: draft, storage_path: `${seller.id}/a.webp`, sort_order: 0 });
    expect(ok.error).toBeNull();

    const refused = await seller.client
      .from("listing_photos")
      .insert({ listing_id: live, storage_path: `${seller.id}/b.webp`, sort_order: 0 });
    expect(refused.error?.code).toBe("42501");
  });

  it("does not let a seller delete the photos of a live annonce", async () => {
    const live = await seedListing(seller.id, "published");
    await svc
      .from("listing_photos")
      .insert({ listing_id: live, storage_path: `${seller.id}/c.webp`, sort_order: 0 });
    await seller.client.from("listing_photos").delete().eq("listing_id", live);
    const { count } = await svc
      .from("listing_photos")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", live);
    expect(count).toBe(1);
  });

  it("lets anon read the fitments of a live part, and nothing of a draft", async () => {
    const live = await seedListing(seller.id, "published");
    const draft = await seedListing(seller.id, "draft");
    await svc.from("listing_fitments").insert([
      { listing_id: live, make: "Peugeot", model: "208", year_from: 2015, year_to: 2020 },
      { listing_id: draft, make: "Renault", model: "Clio", year_from: 2012, year_to: 2018 },
    ]);
    const visible = await anon().from("listing_fitments").select("make").eq("listing_id", live);
    expect(visible.error).toBeNull();
    expect(visible.data).toEqual([{ make: "Peugeot" }]);

    const hidden = await anon().from("listing_fitments").select("make").eq("listing_id", draft);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });

  it("does not let a seller add fitments to a live annonce", async () => {
    const live = await seedListing(seller.id, "published");
    const { error } = await seller.client
      .from("listing_fitments")
      .insert({ listing_id: live, make: "Kia" });
    expect(error?.code).toBe("42501");
  });
});

// ── 0183 · banned sellers ───────────────────────────────────────────────────

describe("0183 — a banned seller cannot be put in front of buyers", () => {
  beforeEach(async () => {
    await svc.from("profiles").update({ banned_at: null, banned_reason: null }).eq("id", other.id);
  });

  it("refuses the service role moving a banned seller's draft to review", async () => {
    const id = await seedListing(other.id, "draft", { seller_attestation_version: "v1" });
    await svc
      .from("profiles")
      .update({ banned_at: new Date().toISOString(), banned_reason: "test" })
      .eq("id", other.id);
    const { error } = await svc.from("listings").update({ status: "pending_review" }).eq("id", id);
    expect(error?.message).toContain("seller_banned");
    expect((await readListing(id)).status).toBe("draft");
  });

  it("lets the same transition through once the ban is lifted", async () => {
    const id = await seedListing(other.id, "draft", { seller_attestation_version: "v1" });
    const { error } = await svc.from("listings").update({ status: "pending_review" }).eq("id", id);
    expect(error).toBeNull();
    expect((await readListing(id)).status).toBe("pending_review");
  });
});

// ── 0184 · reveal_listing_contact ───────────────────────────────────────────

describe("0184 — reveal_listing_contact behaves like the web route", () => {
  beforeEach(clearRevealBuckets);

  it("returns name, phone and WhatsApp for a live annonce, and logs the reveal", async () => {
    const id = await seedListing(seller.id, "published", { contact_whatsapp: "+21620000001" });
    const { data, error } = await anon().rpc("reveal_listing_contact", { p_listing: id });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      ok: true,
      name: "Vendeur Test",
      phone: "+21620000000",
      whatsapp: "+21620000001",
    });
    const log = await db.query(
      `select ip_hash from public.contact_reveals where listing_id = $1`,
      [id],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].ip_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a hidden number and an annonce that is not live", async () => {
    const hidden = await seedListing(seller.id, "published", { show_phone: false });
    const draft = await seedListing(seller.id, "draft");
    const a = await anon().rpc("reveal_listing_contact", { p_listing: hidden });
    expect(a.data).toEqual({ ok: false, reason: "hidden" });
    const b = await anon().rpc("reveal_listing_contact", { p_listing: draft });
    expect(b.data).toEqual({ ok: false, reason: "not_available" });
  });

  it("stops one client after 40 reveals an hour, forged X-Forwarded-For or not", async () => {
    const id = await seedListing(seller.id, "published");
    const client = anon();
    for (let i = 0; i < 40; i++) {
      const { data } = await client.rpc("reveal_listing_contact", { p_listing: id });
      expect((data as { ok: boolean }).ok).toBe(true);
    }
    const over = await client.rpc("reveal_listing_contact", { p_listing: id });
    expect(over.data).toEqual({ ok: false, reason: "rate_limited" });

    // A scraper rotating a fake first hop must land in the same bucket.
    const env = requireEnv();
    const forged = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}` } },
    });
    const dodge = await forged.rpc("reveal_listing_contact", { p_listing: id });
    expect(dodge.data).toEqual({ ok: false, reason: "rate_limited" });
  });
});
