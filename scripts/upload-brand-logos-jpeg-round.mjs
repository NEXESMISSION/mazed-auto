// Second pass — replaces the 5 logos the user re-cropped to square.
// SAFETY: same project-ref gate as upload-brand-logos.mjs. Refuses to
// run against anything other than the Mazed Auto Supabase project.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MARQUES_DIR = resolve(REPO_WEB_DIR, "..", "marques", "JPEG");

const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

function fail(msg) {
  console.error("\n❌  " + msg + "\n");
  process.exit(1);
}

function loadEnvLocal() {
  const path = resolve(REPO_WEB_DIR, ".env.local");
  const raw = readFileSync(path, "utf8");
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

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) fail("Supabase env missing from .env.local");

const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null;
if (projectRef !== MAZED_AUTO_PROJECT_REF) {
  fail(
    `Project ref mismatch — refusing to run.\n` +
    `   Expected: ${MAZED_AUTO_PROJECT_REF}\n   Got: ${projectRef}`,
  );
}

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Source dir            :", MARQUES_DIR);

// Only the 5 brands the user replaced. The other 6 keep their existing
// logos from the first round.
const BRAND_MAP = [
  { file: "renault_PNG39.jpg",                                                                                              slug: "renault" },
  { file: "toyota-brand-logo-car-symbol-white-design-japan-automobile-illustration-with-black-background-free-vector.jpg",  slug: "toyota"  },
  { file: "b-m-w-logo-design-uovzsfnkx97cnkhi.jpg",                                                                          slug: "bmw"     },
  { file: "fiat-logo-black-1024x768.jpg",                                                                                    slug: "fiat"    },
  { file: "skoda-brand-logo-car-symbol-white-design-czech-automobile-illustration-with-black-background-free-vector.jpg",   slug: "skoda"   },
];

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

// Pre-flight: every file exists.
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

  // UPDATE only — these slugs already exist from the first round; we
  // just point logo_url at the new square version.
  const { error: updateErr } = await supabase
    .from("cms_brands")
    .update({ logo_url: pub.publicUrl })
    .eq("slug", brand.slug);
  if (updateErr) {
    console.error(`✗  ${brand.slug}: db update failed —`, updateErr.message);
    errCount++;
    continue;
  }

  console.log(`✓  ${brand.slug.padEnd(10)} → ${pub.publicUrl}`);
  okCount++;
}

console.log(`\nDone. ${okCount} ok, ${errCount} failed.`);
process.exit(errCount > 0 ? 1 : 0);
