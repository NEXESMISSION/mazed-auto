// Final pass — converts every marques/*.png to WebP (q90, lossless-
// ish for simple logos), re-uploads to cms-brand-logos, and updates
// cms_brands.logo_url. WebP is ~40-60% smaller than the source PNG
// and rendered crisp by the Supabase image-transform endpoint.
//
// SAFETY: project-ref-gated.

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
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
  fail(`Project ref mismatch: ${projectRef}`);
}

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Source dir            :", MARQUES_DIR);

// Same map as upload-brand-logos-v3 — just outputs WebP this time.
const BRAND_MAP = [
  { file: "renault.png",  slug: "renault",  displayName: "Renault",    position: 10 },
  { file: "peugeot.png",  slug: "peugeot",  displayName: "Peugeot",    position: 20 },
  { file: "ww.png",       slug: "vw",       displayName: "Volkswagen", position: 30 },
  { file: "toyota.png",   slug: "toyota",   displayName: "Toyota",     position: 40 },
  { file: "hundai.png",   slug: "hyundai",  displayName: "Hyundai",    position: 50 },
  { file: "bmw.png",      slug: "bmw",      displayName: "BMW",        position: 60 },
  { file: "mercides.png", slug: "mercedes", displayName: "Mercedes",   position: 70 },
  { file: "kia.png",      slug: "kia",      displayName: "Kia",        position: 80 },
  { file: "fiat.png",     slug: "fiat",     displayName: "Fiat",       position: 90 },
  { file: "ford.png",     slug: "ford",     displayName: "Ford",       position: 100 },
  { file: "skoda.png",    slug: "skoda",    displayName: "Skoda",      position: 110 },
];

for (const b of BRAND_MAP) {
  try {
    statSync(join(MARQUES_DIR, b.file));
  } catch {
    fail(`Missing file: ${b.file}`);
  }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("\nConverting + uploading:");
let ok = 0;
let errs = 0;
let savedBytes = 0;
for (const brand of BRAND_MAP) {
  const sourcePath = join(MARQUES_DIR, brand.file);
  const sourceBuf = readFileSync(sourcePath);

  // q90 keeps logo edges crisp; effort=6 = best compression for the
  // slightly slower encode. For 200x200 logos this takes ~30ms.
  let webpBuf;
  try {
    webpBuf = await sharp(sourceBuf)
      .webp({ quality: 90, effort: 6 })
      .toBuffer();
  } catch (e) {
    console.error(`✗  ${brand.slug}: encode — ${e.message}`);
    errs++;
    continue;
  }

  const objectPath = `${brand.slug}-${Date.now()}.webp`;
  const upload = await supabase.storage
    .from("cms-brand-logos")
    .upload(objectPath, webpBuf, {
      contentType: "image/webp",
      upsert: false,
    });
  if (upload.error) {
    console.error(`✗  ${brand.slug}: upload — ${upload.error.message}`);
    errs++;
    continue;
  }
  const { data: pub } = supabase.storage
    .from("cms-brand-logos")
    .getPublicUrl(objectPath);

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

  const saved = sourceBuf.length - webpBuf.length;
  savedBytes += saved;
  console.log(
    `✓  ${brand.slug.padEnd(10)} ${basename(brand.file).padEnd(15)} ${(sourceBuf.length / 1024).toFixed(0).padStart(3)}KB → ${(webpBuf.length / 1024).toFixed(0).padStart(3)}KB  (-${((saved / sourceBuf.length) * 100).toFixed(0)}%)`,
  );
  ok++;
}

console.log(
  `\nDone. ${ok} uploaded + upserted, ${errs} failed. Total saved: ${(savedBytes / 1024).toFixed(0)} KB.`,
);
process.exit(errs > 0 ? 1 : 0);
