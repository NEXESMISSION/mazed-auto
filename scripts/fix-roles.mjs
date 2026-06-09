// Set demo roles + mark all demo users KYC-verified, over the Postgres pooler.
//
// profiles.role/kyc_status/trust_score are protected by the
// _guard_profile_self_update trigger (0006/0015): changes are rejected unless
// is_admin() OR the transaction-local GUC app.bypass_profile_guard='on' is set.
// Our seed/import ran plain service-role updates, so every protected-column
// patch was rejected — leaving all users role=individual, kyc=none. We use the
// same legitimate bypass the server's trusted triggers use, inside one tx.
//
// Needs SB_REF + SB_DB_PASSWORD (+ optional SB_HOST).
import pg from "pg";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first"); // skip the unroutable IPv6 NAT64 addrs
const { Client } = pg;

const HOST = process.env.SB_HOST || "aws-1-eu-north-1.pooler.supabase.com";
const USER = `postgres.${process.env.SB_REF || "jxwsbmniubiuujeblwbt"}`;
async function connect() {
  // Intermittent connectivity: retry, alternating session(5432)/txn(6543) pooler.
  for (let i = 0; i < 12; i++) {
    const port = i % 2 === 0 ? 5432 : 6543;
    const c = new Client({
      host: HOST, port, user: USER, password: process.env.SB_DB_PASSWORD,
      database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
    });
    try { await c.connect(); console.log(`connected on :${port}`); return c; }
    catch (e) { try { await c.end(); } catch { /* ignore */ } console.log(`  connect attempt ${i + 1} (:${port}) failed: ${e.message?.slice(0, 50)}`); await new Promise((r) => setTimeout(r, 2000)); }
  }
  throw new Error("could not connect to pooler after retries");
}
const client = await connect();

const before = await client.query("select role, count(*)::int n from public.profiles group by role order by role");
console.log("BEFORE:", JSON.stringify(Object.fromEntries(before.rows.map((r) => [r.role, r.n]))));

await client.query("begin");
await client.query("select set_config('app.bypass_profile_guard','on',true)");

const admin = await client.query(
  "update public.profiles p set role='admin' from auth.users u where u.id=p.id and lower(u.email)='admin@mazed.tn'",
);
const dealers = await client.query(
  `update public.profiles p set role='agency' from auth.users u
   where u.id=p.id and lower(u.email) in
   ('autodeal.tunis@mazed.tn','premiumcars.sfax@mazed.tn','megamotors.sousse@mazed.tn')`,
);
// All demo users KYC-verified + trusted so bidding/selling isn't gated.
const kyc = await client.query(
  `update public.profiles
   set kyc_status='verified', kyc_verified_at=now(), trust_score=greatest(trust_score,80)
   where kyc_status is distinct from 'verified' or trust_score < 80`,
);
await client.query("commit");

console.log(`admin rows=${admin.rowCount} · agency rows=${dealers.rowCount} · kyc-verified rows=${kyc.rowCount}`);

const after = await client.query(`
  select role, count(*)::int n, count(*) filter (where kyc_status='verified')::int verified
  from public.profiles group by role order by role`);
console.log("AFTER:");
for (const r of after.rows) console.log(`  ${r.role}: ${r.n} (verified: ${r.verified})`);
await client.end();
