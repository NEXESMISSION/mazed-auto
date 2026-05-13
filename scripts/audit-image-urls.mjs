// Reports what's actually in auctions.image_urls so we know what to
// re-encode. Project-ref-gated like every other script.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

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
  console.error(`Project ref mismatch: ${projectRef}`);
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supa
  .from("auctions")
  .select("id, image_urls")
  .order("end_time");
if (error) {
  console.error(error);
  process.exit(1);
}

let total = 0;
let unsplash = 0;
let supabaseHost = 0;
let other = 0;
const sample = new Set();

for (const row of data ?? []) {
  for (const url of row.image_urls ?? []) {
    total++;
    if (url.startsWith("https://images.unsplash.com/")) {
      unsplash++;
      if (sample.size < 3) sample.add(url.split("?")[0]);
    } else if (url.includes("/storage/v1/object/public/")) {
      supabaseHost++;
    } else {
      other++;
    }
  }
}

console.log(`Auctions inspected      : ${data?.length ?? 0}`);
console.log(`Total image URLs        : ${total}`);
console.log(`  Unsplash (external)   : ${unsplash}`);
console.log(`  Supabase (project)    : ${supabaseHost}`);
console.log(`  Other / unknown       : ${other}`);
console.log(`\nSample Unsplash URLs:`);
for (const u of sample) console.log(`  ${u}`);
