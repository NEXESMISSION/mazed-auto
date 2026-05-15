// Full importer for the 56 brand logos scraped from automobile.tn.
// Uploads every PNG in ../marques/ named after a brand slug, then
// upserts the matching row in cms_brands so the home grid renders
// every marque with its logo.
//
// SAFETY:
//   - Reads ONLY web/.env.local — no other paths.
//   - Hard-aborts unless the project ref equals MAZED_AUTO_PROJECT_REF.
//   - Uses the service-role key (bypasses RLS for the admin write path).
//   - Skips upload if the slug already has a logo_url in cms_brands AND
//     the path on disk is unchanged. Pass --force to re-upload.
//
// Run from web/:
//   node scripts/upload-brand-logos-full.mjs
//   node scripts/upload-brand-logos-full.mjs --force

import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MARQUES_DIR = resolve(REPO_WEB_DIR, "..", "marques");

const FORCE = process.argv.includes("--force");

// ============================================================
// SAFETY: lock to this exact Supabase project. Refuse any other.
// ============================================================
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

function fail(msg) {
  console.error("\nERR  " + msg + "\n");
  process.exit(1);
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) fail("NEXT_PUBLIC_SUPABASE_URL missing from web/.env.local");
if (!SERVICE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY missing from web/.env.local");

const refMatch = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : null;
if (projectRef !== MAZED_AUTO_PROJECT_REF) {
  fail(
    `Project ref mismatch — refusing to run.\n` +
      `   Expected: ${MAZED_AUTO_PROJECT_REF}\n` +
      `   Got     : ${projectRef ?? "(unparseable)"}`,
  );
}

console.log("OK   Locked to project ref:", projectRef);
console.log("OK   Source dir            :", MARQUES_DIR);
console.log("OK   Force re-upload       :", FORCE);

// --- 56 brands from automobile.tn/fr/neuf ---------------------------
// Order = display position in /auctions filter + home grid. Sorted
// alphabetically because there's no natural popularity ranking and
// users can scan an alphabetical list faster than a curated one.
const BRAND_MAP = [
  { file: "audi.png",             slug: "audi",            displayName: "Audi",            position: 10 },
  { file: "avantier.png",         slug: "avantier",        displayName: "Avantier",        position: 20 },
  { file: "bako.png",             slug: "bako",            displayName: "Bako",            position: 30 },
  { file: "bmw.png",              slug: "bmw",             displayName: "BMW",             position: 40 },
  { file: "byd.png",              slug: "byd",             displayName: "BYD",             position: 50 },
  { file: "cenntro.png",          slug: "cenntro",         displayName: "Cenntro",         position: 60 },
  { file: "changan.png",          slug: "changan",         displayName: "Changan",         position: 70 },
  { file: "chery.png",            slug: "chery",           displayName: "Chery",           position: 80 },
  { file: "chevrolet.png",        slug: "chevrolet",       displayName: "Chevrolet",       position: 90 },
  { file: "citroen.png",          slug: "citroen",         displayName: "Citroën",         position: 100 },
  { file: "cupra.png",            slug: "cupra",           displayName: "Cupra",           position: 110 },
  { file: "dacia.png",            slug: "dacia",           displayName: "Dacia",           position: 120 },
  { file: "deepal.png",           slug: "deepal",          displayName: "Deepal",          position: 130 },
  { file: "dfsk.png",             slug: "dfsk",            displayName: "DFSK",            position: 140 },
  { file: "dongfeng.png",         slug: "dongfeng",        displayName: "Dongfeng",        position: 150 },
  { file: "faw.png",              slug: "faw",             displayName: "Faw",             position: 160 },
  { file: "fiat.png",             slug: "fiat",            displayName: "Fiat",            position: 170 },
  { file: "foday.png",            slug: "foday",           displayName: "Foday",           position: 180 },
  { file: "ford.png",             slug: "ford",            displayName: "Ford",            position: 190 },
  { file: "foton.png",            slug: "foton",           displayName: "Foton",           position: 200 },
  { file: "gac.png",              slug: "gac",             displayName: "GAC",             position: 210 },
  { file: "geely.png",            slug: "geely",           displayName: "Geely",           position: 220 },
  { file: "gwm.png",              slug: "gwm",             displayName: "GWM",             position: 230 },
  { file: "honda.png",            slug: "honda",           displayName: "Honda",           position: 240 },
  { file: "hyundai.png",          slug: "hyundai",         displayName: "Hyundai",         position: 250 },
  { file: "im-motors.png",        slug: "im-motors",       displayName: "IM Motors",       position: 260 },
  { file: "jac.png",              slug: "jac",             displayName: "JAC",             position: 270 },
  { file: "jaguar.png",           slug: "jaguar",          displayName: "Jaguar",          position: 280 },
  { file: "jeep.png",             slug: "jeep",            displayName: "Jeep",            position: 290 },
  { file: "jetour.png",           slug: "jetour",          displayName: "Jetour",          position: 300 },
  { file: "jmc.png",              slug: "jmc",             displayName: "JMC",             position: 310 },
  { file: "jmev.png",             slug: "jmev",            displayName: "JMEV",            position: 320 },
  { file: "kia.png",              slug: "kia",             displayName: "KIA",             position: 330 },
  { file: "land-rover.png",       slug: "land-rover",      displayName: "Land Rover",      position: 340 },
  { file: "lynk-and-co.png",      slug: "lynk-and-co",     displayName: "Lynk & Co",       position: 350 },
  { file: "mahindra.png",         slug: "mahindra",        displayName: "Mahindra",        position: 360 },
  { file: "mercedes-benz.png",    slug: "mercedes-benz",   displayName: "Mercedes-Benz",   position: 370 },
  { file: "mg.png",               slug: "mg",              displayName: "MG",              position: 380 },
  { file: "mini.png",             slug: "mini",            displayName: "Mini",            position: 390 },
  { file: "mitsubishi.png",       slug: "mitsubishi",      displayName: "Mitsubishi",      position: 400 },
  { file: "nissan.png",           slug: "nissan",          displayName: "Nissan",          position: 410 },
  { file: "omoda-and-jaecoo.png", slug: "omoda-and-jaecoo",displayName: "Omoda & Jaecoo",  position: 420 },
  { file: "opel.png",             slug: "opel",            displayName: "Opel",            position: 430 },
  { file: "peugeot.png",          slug: "peugeot",         displayName: "Peugeot",         position: 440 },
  { file: "porsche.png",          slug: "porsche",         displayName: "Porsche",         position: 450 },
  { file: "renault.png",          slug: "renault",         displayName: "Renault",         position: 460 },
  { file: "seat.png",             slug: "seat",            displayName: "Seat",            position: 470 },
  { file: "skoda.png",            slug: "skoda",           displayName: "Skoda",           position: 480 },
  { file: "ssangyong.png",        slug: "ssangyong",       displayName: "Ssangyong",       position: 490 },
  { file: "suzuki.png",           slug: "suzuki",          displayName: "Suzuki",          position: 500 },
  { file: "tata.png",             slug: "tata",            displayName: "Tata",            position: 510 },
  { file: "toyota.png",           slug: "toyota",          displayName: "Toyota",          position: 520 },
  { file: "volkswagen.png",       slug: "volkswagen",      displayName: "Volkswagen",      position: 530 },
  { file: "volvo.png",            slug: "volvo",           displayName: "Volvo",           position: 540 },
  { file: "wallyscar.png",        slug: "wallyscar",       displayName: "Wallyscar",       position: 550 },
  { file: "xpeng.png",            slug: "xpeng",           displayName: "Xpeng",           position: 560 },
];

// Sanity check: every mapped file exists on disk.
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
    `These files are listed in BRAND_MAP but not on disk:\n   ${missing.join("\n   ")}`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Fetch the current cms_brands rows so we can skip already-uploaded
// brands when not in --force mode.
const { data: existingRows, error: listErr } = await supabase
  .from("cms_brands")
  .select("slug, logo_url, display_name");
if (listErr) fail(`Could not read cms_brands: ${listErr.message}`);
const existingBySlug = new Map(
  (existingRows ?? []).map((r) => [r.slug, r]),
);

console.log(`OK   Existing brands in DB: ${existingBySlug.size}`);

let okCount = 0;
let skipCount = 0;
let errCount = 0;

for (const brand of BRAND_MAP) {
  const existing = existingBySlug.get(brand.slug);
  const hasLogo = Boolean(existing?.logo_url);

  if (!FORCE && hasLogo) {
    console.log(`SKIP ${brand.slug.padEnd(20)} already has logo`);
    skipCount++;
    continue;
  }

  const buf = readFileSync(join(MARQUES_DIR, brand.file));

  // Path: <slug>-<timestamp>.png — same pattern as the admin uploader
  // so a viewer caching the old URL doesn't see a 404 when we re-upload.
  const objectPath = `${brand.slug}-${Date.now()}.png`;

  const upload = await supabase.storage
    .from("cms-brand-logos")
    .upload(objectPath, buf, { contentType: "image/png", upsert: false });
  if (upload.error) {
    console.error(`ERR  ${brand.slug}: upload failed — ${upload.error.message}`);
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
    console.error(`ERR  ${brand.slug}: db upsert failed — ${upsertErr.message}`);
    errCount++;
    continue;
  }

  console.log(`OK   ${brand.slug.padEnd(20)} → ${publicUrl}`);
  okCount++;
}

console.log(
  `\nDone. ${okCount} uploaded, ${skipCount} skipped, ${errCount} failed. ` +
    `Total in DB after this run: ${existingBySlug.size + okCount} (approx).`,
);
process.exit(errCount > 0 ? 1 : 0);
