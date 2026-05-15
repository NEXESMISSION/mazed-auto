// One-shot cleanup — delete stale brand slugs that duplicate the
// canonical names from automobile.tn (which we imported in bulk via
// upload-brand-logos-full.mjs).
//
// Run from web/:
//   node scripts/deactivate-stale-brands.mjs

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

// Old slug → canonical replacement. We DELETE these because the user
// asked to overwrite the old stuff with the new (the canonical slug
// already has the correct logo + display_name from automobile.tn).
const STALE_SLUGS = [
  { slug: "vw",       canonical: "volkswagen"    },
  { slug: "mercedes", canonical: "mercedes-benz" },
];

for (const s of STALE_SLUGS) {
  const { error } = await supabase
    .from("cms_brands")
    .delete()
    .eq("slug", s.slug);
  if (error) {
    console.error(`ERR  ${s.slug} → ${error.message}`);
  } else {
    console.log(`OK   deleted ${s.slug} (canonical kept: ${s.canonical})`);
  }
}
