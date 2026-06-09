// Apply ALL migrations in supabase/migrations/*.sql to a FRESH Supabase project
// over a direct Postgres connection (uses the `pg` driver — already a dep).
//
// Why this exists: land's _apply-pending.ps1 uses the Management API + an
// account-scoped CLI token. The car project lives under a DIFFERENT Supabase
// account, so that token can't reach it. We have the DB password instead, so
// we connect straight to Postgres.
//
// Secrets come from env (never hard-coded here):
//   SB_REF          project ref, e.g. jxwsbmniubiuujeblwbt
//   SB_DB_PASSWORD  database password
//
// New projects expose the direct host (db.<ref>.supabase.co) over IPv6 only,
// which many Windows boxes can't route — so we probe the IPv4 Supavisor
// pooler across regions first and fall back to direct last. Wrong-region
// poolers connect at TCP but fail auth ("Tenant or user not found"), so they
// drop out fast; the right region authenticates.
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { Client } = pg;

const REF = process.env.SB_REF;
const PASSWORD = process.env.SB_DB_PASSWORD;
if (!REF || !PASSWORD) {
  console.error("Set SB_REF and SB_DB_PASSWORD env vars.");
  process.exit(2);
}

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

const REGIONS = [
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "eu-north-1", "eu-central-2", "eu-west-0",
];
const candidates = [];
for (const prefix of ["aws-0", "aws-1"]) {
  for (const r of REGIONS) {
    candidates.push({
      label: `pooler ${prefix}-${r}:5432`,
      host: `${prefix}-${r}.pooler.supabase.com`,
      port: 5432,
      user: `postgres.${REF}`,
    });
  }
}
candidates.push({
  label: `direct db.${REF}:5432`,
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: "postgres",
});

// Explicit override — once the region is known, pass SB_HOST (and optionally
// SB_PORT / SB_USER) to skip the probe and connect straight away.
if (process.env.SB_HOST) {
  candidates.unshift({
    label: `override ${process.env.SB_HOST}:${process.env.SB_PORT || 5432}`,
    host: process.env.SB_HOST,
    port: Number(process.env.SB_PORT || 5432),
    user: process.env.SB_USER || `postgres.${REF}`,
  });
}

async function tryConnect(c) {
  const client = new Client({
    host: c.host,
    port: c.port,
    user: c.user,
    password: PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 180000,
    query_timeout: 180000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return client;
  } catch (e) {
    try { await client.end(); } catch { /* ignore */ }
    return { err: e.message };
  }
}

let client = null;
let chosen = null;
for (const c of candidates) {
  process.stdout.write(`probe ${c.label} ... `);
  const r = await tryConnect(c);
  if (r && typeof r.query === "function") {
    client = r; chosen = c;
    console.log("OK");
    break;
  }
  console.log(r?.err ? `no (${r.err.slice(0, 60)})` : "no");
}

if (!client) {
  console.error(
    "\nNo connection candidate worked. Open the Supabase dashboard → Connect →" +
    " 'Session pooler', and paste me the full connection URI.",
  );
  process.exit(3);
}
console.log(`\n==> connected via ${chosen.label}\n`);

// Migration-history table. Supabase pre-creates this; create-if-not-exists is
// a safety net and never clobbers an existing one.
await client.query("create schema if not exists supabase_migrations");
await client.query(
  "create table if not exists supabase_migrations.schema_migrations (" +
  "version text primary key, name text, statements text[], " +
  "inserted_at timestamptz default now())",
);

const appliedRes = await client.query(
  "select version from supabase_migrations.schema_migrations",
);
const applied = new Set(appliedRes.rows.map((r) => r.version));

const files = readdirSync(MIG_DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

let ok = 0;
let skipped = 0;
for (const f of files) {
  const version = f.match(/^(\d+)_/)[1];
  const name = f.replace(/^\d+_/, "").replace(/\.sql$/, "");
  if (applied.has(version)) { skipped++; continue; }
  const sql = readFileSync(join(MIG_DIR, f), "utf8");
  try {
    await client.query(sql);
  } catch (e) {
    console.error(`\nX FAILED at ${f}:\n  ${e.message}`);
    if (e.detail) console.error(`  detail: ${e.detail}`);
    if (e.hint) console.error(`  hint: ${e.hint}`);
    await client.end();
    process.exit(4);
  }
  await client.query(
    "insert into supabase_migrations.schema_migrations (version,name,statements) " +
    "values ($1,$2,'{}') on conflict (version) do nothing",
    [version, name],
  );
  ok++;
  if (ok % 10 === 0) console.log(`  ...applied ${ok}`);
}

console.log(`\nDONE. applied=${ok}, already-present=${skipped}, total=${files.length}`);
await client.end();
