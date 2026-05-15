// Quick dump of cms_brands — to check what's in the DB and spot
// duplicates / stale slugs after a bulk upload.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");

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

const { data, error } = await supabase
  .from("cms_brands")
  .select("slug, display_name, logo_url, is_active, position")
  .order("position", { ascending: true });

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Total rows: ${data.length}\n`);
for (const r of data) {
  const has = r.logo_url ? "logo" : "----";
  console.log(`${r.position.toString().padStart(4)}  ${r.slug.padEnd(22)}  ${has}  ${r.is_active ? "ON " : "off"}  ${r.display_name}`);
}
