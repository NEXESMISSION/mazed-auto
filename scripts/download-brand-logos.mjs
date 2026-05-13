// Pulls every brand logo back out of Supabase Storage and writes them
// to ../marques/downloaded/ — exact bytes, no transform, no compression.
//
// SAFETY: same project-ref gate as the upload scripts.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_WEB_DIR, "..", "marques", "downloaded");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";
const BUCKET = "cms-brand-logos";

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
  fail(`Project ref mismatch: ${projectRef}`);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

mkdirSync(OUT_DIR, { recursive: true });
console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Writing to            :", OUT_DIR);

// Pull every active brand with a logo_url.
const { data: brands, error } = await supa
  .from("cms_brands")
  .select("slug, logo_url")
  .not("logo_url", "is", null)
  .order("position");

if (error) fail(error.message);

let ok = 0;
let errs = 0;
for (const b of brands ?? []) {
  // Parse the storage path out of the public URL:
  //   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const m = b.logo_url.match(
    /\/storage\/v1\/object\/public\/cms-brand-logos\/(.+)$/,
  );
  if (!m) {
    console.warn(`?  ${b.slug}: URL is not in cms-brand-logos bucket — ${b.logo_url}`);
    errs++;
    continue;
  }
  const objectPath = decodeURIComponent(m[1]);

  // Download via the storage API (bytes, no transform).
  const { data, error: dlErr } = await supa.storage.from(BUCKET).download(objectPath);
  if (dlErr) {
    console.error(`✗  ${b.slug}: download failed — ${dlErr.message}`);
    errs++;
    continue;
  }
  const buf = Buffer.from(await data.arrayBuffer());

  // Save as <slug><.ext> so the file name is predictable (drop the
  // upload timestamp suffix — the user just wants editable copies).
  const ext = basename(objectPath).match(/\.[a-z0-9]+$/i)?.[0] ?? ".bin";
  const outFile = resolve(OUT_DIR, `${b.slug}${ext}`);
  writeFileSync(outFile, buf);
  console.log(
    `✓  ${b.slug.padEnd(10)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB → ${outFile}`,
  );
  ok++;
}

console.log(`\nDone. ${ok} downloaded, ${errs} failed.`);
process.exit(errs > 0 ? 1 : 0);
