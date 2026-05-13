// One-shot: read every cms_brands row + report whether each logo URL
// actually returns 200. Same project-ref gate as upload-brand-logos.mjs.
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
  .from("cms_brands")
  .select("slug, display_name, logo_url, is_active, position")
  .order("position");

if (error) {
  console.error(error);
  process.exit(1);
}

for (const b of data) {
  const url = b.logo_url;
  let status = "(no logo)";
  if (url) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      status = r.ok ? `OK (${r.status})` : `BROKEN (${r.status})`;
    } catch (e) {
      status = `FETCH-ERR: ${e.message}`;
    }
  }
  console.log(
    `${b.slug.padEnd(10)} | ${(b.display_name || "").padEnd(15)} | active=${b.is_active} | ${status}${url ? "  " + url.slice(0, 60) + "..." : ""}`,
  );
}
