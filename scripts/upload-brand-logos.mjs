// One-shot importer for the brand logos at ../marques/.
//
// SAFETY:
//   - Reads ONLY web/.env.local — no other paths.
//   - Hard-aborts unless the project ref equals MAZED_AUTO_PROJECT_REF
//     (the user has another Supabase project with important data; this
//     guard makes sure this script can never write to it by accident).
//   - Uses the service-role key (bypasses RLS for the admin write path).
//
// Run from web/:
//   node scripts/upload-brand-logos.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MARQUES_DIR = resolve(REPO_WEB_DIR, "..", "marques");

// ============================================================
// SAFETY: lock to this exact Supabase project. Refuse any other.
// ============================================================
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

// --- Read web/.env.local (minimal parser, no extra deps) -----------
function loadEnvLocal() {
  const path = resolve(REPO_WEB_DIR, ".env.local");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    fail(`Couldn't read ${path}: ${e.message}`);
  }
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

function fail(msg) {
  console.error("\n❌  " + msg + "\n");
  process.exit(1);
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) fail("NEXT_PUBLIC_SUPABASE_URL missing from web/.env.local");
if (!SERVICE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY missing from web/.env.local");

// Extract the project ref from the URL — e.g.
//   https://erosazbplfhelvxweeyz.supabase.co → erosazbplfhelvxweeyz
const refMatch = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : null;
if (projectRef !== MAZED_AUTO_PROJECT_REF) {
  fail(
    `Project ref mismatch — refusing to run.\n` +
    `   Expected: ${MAZED_AUTO_PROJECT_REF}\n` +
    `   Got     : ${projectRef ?? "(unparseable)"}\n` +
    `   This safety gate prevents the script from touching any other Supabase project.`,
  );
}

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Source dir            :", MARQUES_DIR);

// --- Filename → brand metadata --------------------------------------
// Order = display position on the home slider + /admin/cms/brands grid.
const BRAND_MAP = [
  { file: "renault_PNG39.png",                                                                          slug: "renault",  displayName: "Renault",     position: 10 },
  { file: "peugeot-brand-logo-symbol-white-design-french-car-vector-46125178 (1).avif",                 slug: "peugeot",  displayName: "Peugeot",     position: 20 },
  { file: "images.png",                                                                                  slug: "vw",       displayName: "Volkswagen",  position: 30 },
  { file: "toyota-brand-logo-car-symbol-white-design-japan-automobile-illustration-with-black-background-free-vector.jpg", slug: "toyota", displayName: "Toyota", position: 40 },
  { file: "images (1).png",                                                                              slug: "hyundai",  displayName: "Hyundai",     position: 50 },
  { file: "b-m-w-logo-design-uovzsfnkx97cnkhi.jpg",                                                      slug: "bmw",      displayName: "BMW",         position: 60 },
  { file: "images (2).png",                                                                              slug: "mercedes", displayName: "Mercedes",    position: 70 },
  { file: "images (3).png",                                                                              slug: "kia",      displayName: "Kia",         position: 80 },
  { file: "fiat-logo-black-1024x768.jpg",                                                                slug: "fiat",     displayName: "Fiat",        position: 90 },
  { file: "images (4).png",                                                                              slug: "ford",     displayName: "Ford",        position: 100 },
  { file: "skoda-brand-logo-car-symbol-white-design-czech-automobile-illustration-with-black-background-free-vector.jpg", slug: "skoda", displayName: "Skoda", position: 110 },
];

// --- MIME-by-extension ---------------------------------------------
const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

// --- Verify every mapped file exists before we touch the DB ---------
const missing = [];
for (const b of BRAND_MAP) {
  try {
    statSync(join(MARQUES_DIR, b.file));
  } catch {
    missing.push(b.file);
  }
}
if (missing.length > 0) {
  fail(
    `These files are listed in BRAND_MAP but not on disk:\n   ${missing.join("\n   ")}\n` +
    `Available files:\n   ${readdirSync(MARQUES_DIR).join("\n   ")}`,
  );
}

// --- Connect with the service-role key (bypasses RLS) ---------------
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Upload + upsert one row at a time ------------------------------
let okCount = 0;
let errCount = 0;
for (const brand of BRAND_MAP) {
  const ext = extname(brand.file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    console.error(`✗  ${brand.slug}: unsupported extension ${ext}`);
    errCount++;
    continue;
  }
  const buf = readFileSync(join(MARQUES_DIR, brand.file));

  // Path: <slug>-<timestamp>.<ext> — same pattern as the admin uploader
  // so the storage bucket stays consistent. Re-running picks a new path
  // so an older logo URL doesn't 404 if a viewer has it cached.
  const objectPath = `${brand.slug}-${Date.now()}${ext}`;

  const upload = await supabase.storage
    .from("cms-brand-logos")
    .upload(objectPath, buf, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error(`✗  ${brand.slug}: upload failed —`, upload.error.message);
    errCount++;
    continue;
  }
  const { data: pub } = supabase.storage
    .from("cms-brand-logos")
    .getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  const { error: upsertErr } = await supabase
    .from("cms_brands")
    .upsert(
      {
        slug: brand.slug,
        display_name: brand.displayName,
        logo_url: publicUrl,
        is_active: true,
        position: brand.position,
      },
      { onConflict: "slug" },
    );
  if (upsertErr) {
    console.error(`✗  ${brand.slug}: db upsert failed —`, upsertErr.message);
    errCount++;
    continue;
  }

  console.log(
    `✓  ${brand.slug.padEnd(10)} → ${basename(brand.file).slice(0, 50)} → ${publicUrl}`,
  );
  okCount++;
}

console.log(`\nDone. ${okCount} ok, ${errCount} failed.`);
process.exit(errCount > 0 ? 1 : 0);
