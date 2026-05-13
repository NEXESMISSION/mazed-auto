// Third pass — fresh square logos from ../marques/ replacing whatever
// is currently in cms_brands. Filenames in the folder use casual
// spelling (ww.png = Volkswagen, hundai.png = Hyundai, mercides.png =
// Mercedes); the BRAND_MAP normalises them to the canonical slugs the
// app uses everywhere else.
//
// SAFETY: same project-ref gate as every other script.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { join, extname, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MARQUES_DIR = resolve(REPO_WEB_DIR, "..", "marques");
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

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Source dir            :", MARQUES_DIR);

// Filename → canonical brand slug + display name. Order = visual
// position on the home rail + Classique grid.
const BRAND_MAP = [
  { file: "renault.png",  slug: "renault",  displayName: "Renault",    position: 10 },
  { file: "peugeot.png",  slug: "peugeot",  displayName: "Peugeot",    position: 20 },
  { file: "ww.png",       slug: "vw",       displayName: "Volkswagen", position: 30 },
  { file: "toyota.png",   slug: "toyota",   displayName: "Toyota",     position: 40 },
  { file: "hundai.png",   slug: "hyundai",  displayName: "Hyundai",    position: 50 },
  { file: "bmw.png",      slug: "bmw",      displayName: "BMW",        position: 60 },
  { file: "mercides.png", slug: "mercedes", displayName: "Mercedes",   position: 70 },
  { file: "kia.png",      slug: "kia",      displayName: "Kia",        position: 80 },
  { file: "fiat.png",     slug: "fiat",     displayName: "Fiat",        position: 90 },
  { file: "ford.png",     slug: "ford",     displayName: "Ford",       position: 100 },
  { file: "skoda.png",    slug: "skoda",    displayName: "Skoda",      position: 110 },
];

// PNG dimensions — first 16 bytes of an IHDR chunk give w/h as
// big-endian uint32. Skip-friendly for files that aren't PNG.
function pngSize(buf) {
  // Magic check
  if (
    buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47
  ) return null;
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
  };
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

// Pre-flight: every file exists + dump dimensions so the user can
// spot any non-square sources before we touch the DB.
console.log("\nProbing source files:");
for (const b of BRAND_MAP) {
  const p = join(MARQUES_DIR, b.file);
  try {
    statSync(p);
  } catch {
    fail(`Missing file: ${b.file}`);
  }
  const buf = readFileSync(p);
  const dims = extname(b.file).toLowerCase() === ".png" ? pngSize(buf) : null;
  const dimStr = dims ? `${dims.w}x${dims.h}` : "?";
  const shape = dims
    ? dims.w === dims.h
      ? "SQUARE"
      : dims.w > dims.h
        ? "wide"
        : "TALL"
    : "?";
  console.log(
    `   ${b.slug.padEnd(10)} ${(b.file).padEnd(15)} ${dimStr.padEnd(12)} ${shape}  ${(buf.length / 1024).toFixed(0)} KB`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("\nUploading + upserting:");
let ok = 0;
let errs = 0;
for (const brand of BRAND_MAP) {
  const ext = extname(brand.file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    console.error(`✗  ${brand.slug}: unsupported extension ${ext}`);
    errs++;
    continue;
  }
  const buf = readFileSync(join(MARQUES_DIR, brand.file));
  // Timestamped path so any browser holding the OLD URL doesn't 404 —
  // they continue serving from cache while the new URL propagates.
  const objectPath = `${brand.slug}-${Date.now()}${ext}`;

  const upload = await supabase.storage
    .from("cms-brand-logos")
    .upload(objectPath, buf, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error(`✗  ${brand.slug}: upload — ${upload.error.message}`);
    errs++;
    continue;
  }
  const { data: pub } = supabase.storage
    .from("cms-brand-logos")
    .getPublicUrl(objectPath);

  // Upsert so re-running stays idempotent — same slug → row updated,
  // not duplicated. Other columns (position, is_active, display_name)
  // kept consistent with the canonical mapping.
  const { error: upsertErr } = await supabase.from("cms_brands").upsert(
    {
      slug: brand.slug,
      display_name: brand.displayName,
      logo_url: pub.publicUrl,
      is_active: true,
      position: brand.position,
    },
    { onConflict: "slug" },
  );
  if (upsertErr) {
    console.error(`✗  ${brand.slug}: upsert — ${upsertErr.message}`);
    errs++;
    continue;
  }

  console.log(
    `✓  ${brand.slug.padEnd(10)} ${basename(brand.file).padEnd(15)} → ${pub.publicUrl.slice(0, 80)}…`,
  );
  ok++;
}

console.log(`\nDone. ${ok} uploaded + upserted, ${errs} failed.`);
process.exit(errs > 0 ? 1 : 0);
