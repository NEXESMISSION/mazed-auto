// Nukes every row in public.auctions (and dependent rows that cascade
// from it — bids, watchlist, notifications, etc.). Transactions keep
// their rows but lose their auction_id (ON DELETE SET NULL) so the
// financial audit trail stays intact.
//
// SAFETY:
//   - Same project-ref gate as the brand uploaders. Refuses any other
//     Supabase project.
//   - Service role bypasses RLS but the project-ref check + the
//     human-typed YES prompt are the actual guard rails.
//   - Pre-flight prints counts of every table that's about to lose rows
//     so you can see what's at stake BEFORE confirming.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

function fail(msg) {
  console.error("\n❌  " + msg + "\n");
  process.exit(1);
}

function loadEnvLocal() {
  const raw = readFileSync(resolve(REPO_WEB_DIR, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (projectRef !== MAZED_AUTO_PROJECT_REF) {
  fail(
    `Project ref mismatch — refusing to run.\n` +
    `   Expected: ${MAZED_AUTO_PROJECT_REF}\n   Got: ${projectRef}`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  About to wipe auctions.\n");

// Pre-flight counts so the user knows what's about to disappear.
async function countTable(name, query) {
  const { count, error } = await query;
  if (error) {
    console.warn(`   ${name.padEnd(20)} count error: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

const tables = [
  ["auctions", supabase.from("auctions").select("id", { count: "exact", head: true })],
  ["bids", supabase.from("bids").select("id", { count: "exact", head: true })],
  ["watchlist", supabase.from("watchlist").select("user_id", { count: "exact", head: true })],
  ["notifications", supabase.from("notifications").select("id", { count: "exact", head: true })],
  ["transactions", supabase.from("transactions").select("id", { count: "exact", head: true })],
  [
    "transactions w/ auction_id",
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .not("auction_id", "is", null),
  ],
];

console.log("Current row counts:");
for (const [name, query] of tables) {
  const n = await countTable(name, query);
  console.log(`   ${name.padEnd(28)} ${n ?? "?"}`);
}

// Human-in-the-loop confirmation. The --yes flag is the non-interactive
// escape hatch used when the human has already authorized the wipe in
// the calling script / chat session.
const skipPrompt = process.argv.includes("--yes");
if (!skipPrompt) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    '\nType YES to wipe every auction row (cascade will clear bids / watchlist /\nnotifications too; transactions keep their rows but lose auction_id): ',
  );
  rl.close();
  if (answer.trim() !== "YES") {
    console.log("\nAborted. No rows were touched.\n");
    process.exit(0);
  }
} else {
  console.log("--yes flag set — skipping confirmation prompt.");
}

console.log("\nDeleting...");

// Delete all auctions — FK cascades handle the dependent rows. We use
// a sentinel filter (`gt('end_time', '1900-01-01')`) so PostgREST accepts
// the DELETE without a `?` filter (it refuses unconditional deletes by
// design). end_time is NOT NULL, so this matches every row.
const { error: delErr, count: deletedAuctionsCount } = await supabase
  .from("auctions")
  .delete({ count: "exact" })
  .gt("end_time", "1900-01-01");

if (delErr) {
  fail("Delete failed: " + delErr.message);
}

console.log(`✓  Deleted ${deletedAuctionsCount ?? "?"} auctions.\n`);

// Re-count to confirm.
console.log("Post-wipe row counts:");
for (const [name, query] of tables) {
  // re-build the query — Supabase query builders are single-use.
  const fresh = (() => {
    if (name === "auctions")
      return supabase.from("auctions").select("id", { count: "exact", head: true });
    if (name === "bids")
      return supabase.from("bids").select("id", { count: "exact", head: true });
    if (name === "watchlist")
      return supabase.from("watchlist").select("user_id", { count: "exact", head: true });
    if (name === "notifications")
      return supabase.from("notifications").select("id", { count: "exact", head: true });
    if (name === "transactions")
      return supabase.from("transactions").select("id", { count: "exact", head: true });
    return supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .not("auction_id", "is", null);
  })();
  const n = await countTable(name, fresh);
  console.log(`   ${name.padEnd(28)} ${n ?? "?"}`);
}

console.log("\nDone.");
process.exit(0);
