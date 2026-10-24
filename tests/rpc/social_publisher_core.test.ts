// ============================================================================
// Social Publisher S1 — the rules the database enforces (0195).
//
//   « refus de publication sans consentement »       → consent_required
//   « refus d'accès aux comptes d'une autre boutique » → RLS + account_not_allowed
//   « prévention des publications en double »         → idempotency key + atomic claim
//   « blocage d'un produit vendu »                     → jobs cancelled, no new request
// and the state machine of the brief, whoever tries to bend it.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { admin, createUser, deleteUsers, requireEnv, type TestUser } from "./helpers";

const DSN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let svc: SupabaseClient;
let db: Client;
let vehicleCat: string;
const users: TestUser[] = [];
const shops: string[] = [];

async function user(): Promise<TestUser> {
  const u = await createUser(svc);
  users.push(u);
  return u;
}

/** A shop with a running period, its owner, one live annonce and one connected account per network. */
async function setup() {
  const o = await user();
  const shop = (await db.query(
    `insert into shops (owner_id, activity_type, slug, name, governorate, status)
     values ($1, 'vente_auto', $2, 'Boutique social', 'Tunis', 'active') returning id`,
    [o.id, `soc-${randomUUID().slice(0, 8)}`],
  )).rows[0].id as string;
  shops.push(shop);
  await db.query(`insert into shop_members (shop_id, user_id, role) values ($1, $2, 'owner')`, [shop, o.id]);
  await db.query(
    `insert into subscriptions (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
     select $1, id, '{"vehicles": 20, "parts": 20}', 'active', now() - interval '1 day', now() + interval '20 days',
            now() + interval '27 days', 'test' from products where slug = 'plan-pro'`,
    [shop],
  );
  const listing = (await db.query(
    `insert into listings (seller_id, shop_id, category_id, title, governorate, price, contact_phone,
                           seller_attestation_version, status, published_at, expires_at)
     values ($1, $2, $3, 'Golf 8 social', 'Tunis', 61000, '+21620000000', 'v1', 'published', now(), now() + interval '30 days')
     returning id`,
    [o.id, shop, vehicleCat],
  )).rows[0].id as string;
  const fb = (await db.query(
    `insert into social_accounts (shop_id, network, external_id, name, token_ciphertext, connected_by)
     values ($1, 'facebook', $2, 'Page test', 'cipher', $3) returning id`,
    [shop, `page-${randomUUID().slice(0, 6)}`, o.id],
  )).rows[0].id as string;
  const ig = (await db.query(
    `insert into social_accounts (shop_id, network, external_id, name, token_ciphertext, parent_account_id, connected_by)
     values ($1, 'instagram', $2, 'IG test', 'cipher', $3, $4) returning id`,
    [shop, `ig-${randomUUID().slice(0, 6)}`, fb, o.id],
  )).rows[0].id as string;
  return { o, shop, listing, fb, ig };
}

async function request(shop: string, listing: string, by: string, networks = ["facebook", "instagram"]) {
  return (await db.query(
    `insert into social_publication_requests (listing_id, shop_id, requested_by, networks) values ($1, $2, $3, $4) returning id`,
    [listing, shop, by, networks],
  )).rows[0].id as string;
}
async function variant(req: string, network: string, validated = true) {
  return (await db.query(
    `insert into social_content_variants (request_id, network, body, link_url, source, validated_at)
     values ($1, $2, 'Golf 8, 61 000 DT', 'https://x', 'template', case when $3 then now() end) returning id`,
    [req, network, validated],
  )).rows[0].id as string;
}
async function consent(req: string, listing: string, by: string, networks = ["facebook", "instagram"]) {
  return (await db.query(
    `insert into social_consent_logs (user_id, request_id, listing_id, scope, networks, text_version) values ($1, $2, $3, 'own_accounts', $4, 'v1') returning id`,
    [by, req, listing, networks],
  )).rows[0].id as string;
}
async function job(o: { req: string; variant: string; account: string; consent: string; network: string; status?: string; at?: string }) {
  return (await db.query(
    `insert into social_publication_jobs (request_id, variant_id, account_id, consent_id, network, status, idempotency_key, scheduled_at)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now())) returning id`,
    [o.req, o.variant, o.account, o.consent, o.network, o.status ?? "scheduled", randomUUID(), o.at ?? null],
  )).rows[0].id as string;
}
const statusOf = async (id: string) => (await db.query(`select status from social_publication_jobs where id=$1`, [id])).rows[0].status as string;
const fails = async (sql: string, args: unknown[]) => {
  try { await db.query(sql, args); return null; } catch (e) { return (e as Error).message; }
};

beforeAll(async () => {
  requireEnv();
  svc = admin();
  db = new Client({ connectionString: DSN });
  await db.connect();
  vehicleCat = (await db.query(
    `select id from categories where kind='vehicle' and parent_id is not null and is_active order by sort_order limit 1`,
  )).rows[0].id;
});

afterAll(async () => {
  for (const s of shops) {
    await db.query(`delete from social_publication_requests where shop_id=$1`, [s]);
    await db.query(`delete from social_accounts where shop_id=$1`, [s]);
    await db.query(`delete from listings where shop_id=$1`, [s]);
    await db.query(`delete from subscriptions where shop_id=$1`, [s]);
    await db.query(`delete from shops where id=$1`, [s]);
  }
  await deleteUsers(svc, users);
  await db?.end().catch(() => {});
});

describe("requests and consents", () => {
  it("a request is only for an online annonce of the same shop", async () => {
    const a = await setup();
    const b = await setup();
    expect(await fails(`insert into social_publication_requests (listing_id, shop_id, requested_by, networks) values ($1,$2,$3,'{facebook}')`,
      [a.listing, b.shop, a.o.id])).toMatch(/listing_not_in_shop/);
    await db.query(`update listings set status='sold' where id=$1`, [b.listing]);
    expect(await fails(`insert into social_publication_requests (listing_id, shop_id, requested_by, networks) values ($1,$2,$3,'{facebook}')`,
      [b.listing, b.shop, b.o.id])).toMatch(/listing_not_published/);
  });

  it("no job without a consent for that request and that network", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "instagram");
    const fbOnly = await consent(req, a.listing, a.o.id, ["facebook"]);
    const otherReq = await request(a.shop, a.listing, a.o.id);
    const otherConsent = await consent(otherReq, a.listing, a.o.id);
    await expect(job({ req, variant: v, account: a.ig, consent: fbOnly, network: "instagram" })).rejects.toThrow(/consent_required/);
    await expect(job({ req, variant: v, account: a.ig, consent: otherConsent, network: "instagram" })).rejects.toThrow(/consent_required/);
    const ok = await consent(req, a.listing, a.o.id);
    expect(await job({ req, variant: v, account: a.ig, consent: ok, network: "instagram" })).toBeTruthy();
  });

  it("no job for a text the person has not validated, nor for another network's text", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const c = await consent(req, a.listing, a.o.id);
    const unvalidated = await variant(req, "facebook", false);
    await expect(job({ req, variant: unvalidated, account: a.fb, consent: c, network: "facebook" })).rejects.toThrow(/variant_not_validated/);
    const igText = await variant(req, "instagram");
    await expect(job({ req, variant: igText, account: a.fb, consent: c, network: "facebook" })).rejects.toThrow(/variant_not_validated/);
  });

  it("consents cannot be changed or erased", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const c = await consent(req, a.listing, a.o.id);
    expect(await fails(`update social_consent_logs set networks='{facebook}' where id=$1`, [c])).toBeTruthy();
    expect(await fails(`delete from social_consent_logs where id=$1`, [c])).toBeTruthy();
  });

  it("a job publishes only through an active account of the request's shop", async () => {
    const a = await setup();
    const b = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    await expect(job({ req, variant: v, account: b.fb, consent: c, network: "facebook" })).rejects.toThrow(/account_not_allowed/);
    await expect(job({ req, variant: v, account: a.ig, consent: c, network: "facebook" })).rejects.toThrow(/account_not_allowed/);
    await db.query(`update social_accounts set status='revoked' where id=$1`, [a.fb]);
    await expect(job({ req, variant: v, account: a.fb, consent: c, network: "facebook" })).rejects.toThrow(/account_not_active/);
  });
});

describe("the state machine", () => {
  it("allows the brief's moves and refuses the others", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    const j = await job({ req, variant: v, account: a.fb, consent: c, network: "facebook", status: "draft" });

    expect(await fails(`update social_publication_jobs set status='publishing' where id=$1`, [j])).toMatch(/invalid_transition/);
    await db.query(`update social_publication_jobs set status='pending_approval' where id=$1`, [j]);
    await db.query(`update social_publication_jobs set status='scheduled' where id=$1`, [j]);
    await db.query(`update social_publication_jobs set status='publishing' where id=$1`, [j]);
    expect(await fails(`update social_publication_jobs set status='published' where id=$1`, [j])).toMatch(/published_without_external_id/);
    await db.query(`update social_publication_jobs set status='published', external_id='post_1' where id=$1`, [j]);
    expect(await fails(`update social_publication_jobs set status='scheduled' where id=$1`, [j])).toMatch(/invalid_transition/);
    expect(await fails(`update social_publication_jobs set status='cancelled' where id=$1`, [j])).toMatch(/invalid_transition/);

    const trail = (await db.query(`select after->>'status' s from audit_logs where entity='social_job' and entity_id=$1 order by created_at`, [j])).rows.map((r) => r.s);
    expect(trail).toEqual(["draft", "pending_approval", "scheduled", "publishing", "published"]);
  });

  it("one idempotency key, one job; one external post, one job", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    const key = randomUUID();
    const ins = `insert into social_publication_jobs (request_id, variant_id, account_id, consent_id, network, status, idempotency_key)
                 values ($1,$2,$3,$4,'facebook','scheduled',$5)`;
    await db.query(ins, [req, v, a.fb, c, key]);
    expect(await fails(ins, [req, v, a.fb, c, key])).toMatch(/duplicate key/);
  });

  it("a job is claimed for publishing by exactly one caller, and only when due", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    const j = await job({ req, variant: v, account: a.fb, consent: c, network: "facebook" });
    const claims = await Promise.all(Array.from({ length: 5 }, () => svc.rpc("social_claim_job", { p_job: j })));
    const won = claims.filter((r) => r.data && (r.data as { id?: string }).id === j);
    expect(won).toHaveLength(1);
    expect(await statusOf(j)).toBe("publishing");

    const later = await job({ req, variant: v, account: a.fb, consent: c, network: "facebook", at: new Date(Date.now() + 3600_000).toISOString() });
    const early = await svc.rpc("social_claim_job", { p_job: later });
    expect((early.data as { id?: string } | null)?.id ?? null).toBeNull();
    expect(await statusOf(later)).toBe("scheduled");
  });
});

describe("an annonce that goes offline", () => {
  it("cancels what has not run, keeps what was published, and refuses new requests", async () => {
    const a = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const vf = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    const scheduled = await job({ req, variant: vf, account: a.fb, consent: c, network: "facebook" });
    const draft = await job({ req, variant: vf, account: a.fb, consent: c, network: "facebook", status: "draft" });
    const done = await job({ req, variant: vf, account: a.fb, consent: c, network: "facebook" });
    await db.query(`update social_publication_jobs set status='publishing' where id=$1`, [done]);
    await db.query(`update social_publication_jobs set status='published', external_id=$2 where id=$1`, [done, `p-${randomUUID()}`]);

    await db.query(`update listings set status='sold' where id=$1`, [a.listing]);
    expect(await statusOf(scheduled)).toBe("cancelled");
    expect(await statusOf(draft)).toBe("cancelled");
    expect(await statusOf(done)).toBe("published");
    await expect(request(a.shop, a.listing, a.o.id)).rejects.toThrow(/listing_not_published/);
  });
});

describe("who reads what", () => {
  it("a member reads their shop's accounts and jobs, never a token; another shop reads nothing; nobody writes", async () => {
    const a = await setup();
    const b = await setup();
    const req = await request(a.shop, a.listing, a.o.id);
    const v = await variant(req, "facebook");
    const c = await consent(req, a.listing, a.o.id);
    await job({ req, variant: v, account: a.fb, consent: c, network: "facebook" });

    const own = await a.o.client.from("social_accounts").select("id, name, status").eq("shop_id", a.shop);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(2);
    const token = await a.o.client.from("social_accounts").select("token_ciphertext").eq("shop_id", a.shop);
    expect(token.error).not.toBeNull();
    const theirs = await b.o.client.from("social_accounts").select("id").eq("shop_id", a.shop);
    expect(theirs.data ?? []).toHaveLength(0);
    const theirJobs = await b.o.client.from("social_publication_jobs").select("id").eq("request_id", req);
    expect(theirJobs.data ?? []).toHaveLength(0);
    const ownJobs = await a.o.client.from("social_publication_jobs").select("id, status").eq("request_id", req);
    expect(ownJobs.data).toHaveLength(1);

    const write = await a.o.client.from("social_publication_requests").insert({ listing_id: a.listing, shop_id: a.shop, requested_by: a.o.id, networks: ["facebook"] });
    expect(write.error).not.toBeNull();
    const claim = await a.o.client.rpc("social_claim_job", { p_job: randomUUID() });
    expect(claim.error).not.toBeNull();
  });
});
