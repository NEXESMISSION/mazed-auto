// Delete brand-logo files in the cms-brand-logos bucket that no
// cms_brands row still references. Runs after upload-brand-logos-full
// + deactivate-stale-brands so old uploads don't accumulate forever.
//
// Run from web/:
//   node scripts/prune-orphan-brand-logos.mjs
//   node scripts/prune-orphan-brand-logos.mjs --dry  (preview only)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

function loadEnv() {
  const raw = readFileSync(resolve(REPO_WEB_DIR, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) Collect every storage path referenced by an active brand.
const { data: brands, error: bErr } = await supabase
  .from("cms_brands")
  .select("slug, logo_url");
if (bErr) {
  console.error(bErr);
  process.exit(1);
}

const referenced = new Set();
for (const b of brands ?? []) {
  if (!b.logo_url) continue;
  // public URL → /storage/v1/object/public/cms-brand-logos/<path>
  const m = b.logo_url.match(/\/cms-brand-logos\/(.+)$/);
  if (m) referenced.add(m[1]);
}

// 2) List every file in the bucket. The storage list API paginates
//    at 1000 by default — fine here, we have well under that.
const { data: files, error: lErr } = await supabase.storage
  .from("cms-brand-logos")
  .list("", { limit: 10000 });
if (lErr) {
  console.error(lErr);
  process.exit(1);
}

const toDelete = (files ?? [])
  .map((f) => f.name)
  .filter((name) => !referenced.has(name));

console.log(`Referenced files: ${referenced.size}`);
console.log(`Files in bucket : ${files.length}`);
console.log(`Orphans to prune: ${toDelete.length}`);
if (DRY) {
  for (const n of toDelete) console.log("  DRY  would delete", n);
  process.exit(0);
}

if (toDelete.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

// Delete in chunks of 100 (storage API accepts an array).
for (let i = 0; i < toDelete.length; i += 100) {
  const chunk = toDelete.slice(i, i + 100);
  const { error } = await supabase.storage
    .from("cms-brand-logos")
    .remove(chunk);
  if (error) {
    console.error(`ERR  chunk @${i}: ${error.message}`);
  } else {
    console.log(`OK   deleted ${chunk.length} file(s)`);
  }
}
