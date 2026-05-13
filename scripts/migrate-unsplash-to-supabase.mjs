// Downloads every Unsplash URL currently in auctions.image_urls,
// re-hosts it on Supabase Storage as a sized WebP, and rewrites every
// auction row's image_urls array. After this runs the site only ever
// hits the Supabase render-image endpoint (same CDN, much faster from
// Tunisia + 5-10x smaller payloads).
//
// SAFETY: project-ref-gated like every other script.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

const BUCKET = "auction-media";
// Where rehosted seed photos land. Service role writes anywhere; the
// owner-write RLS path is `<uid>/...` for real user uploads — we use a
// distinct `seed/` prefix so it's obvious in the dashboard which files
// are seed-data and which are real auction photos.
const PREFIX = "seed/";

// Unsplash CDN supports sizing + format params, so we pre-size the
// image to ~1600px WebP at q=80 (~150-300 KB). That's the largest
// dimension we render anywhere in the app.
const TARGET_WIDTH = 1600;
const TARGET_QUALITY = 80;

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
if (projectRef !== MAZED_AUTO_PROJECT_REF) fail(`Project ref mismatch: ${projectRef}`);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("✓  Locked to project ref:", projectRef);
console.log(`✓  Re-hosting Unsplash → ${BUCKET}/${PREFIX} as WebP @${TARGET_WIDTH}w q${TARGET_QUALITY}`);

// 1) Pull every auction row.
const { data: auctions, error: listErr } = await supabase
  .from("auctions")
  .select("id, image_urls");
if (listErr) fail("listing auctions: " + listErr.message);

// 2) Collect every distinct Unsplash photo id so we re-download each
//    one exactly once even if the seed reused the same URL.
const uniquePhotos = new Map(); // unsplashId → original URL
for (const row of auctions ?? []) {
  for (const url of row.image_urls ?? []) {
    if (!url.startsWith("https://images.unsplash.com/")) continue;
    const base = url.split("?")[0];
    const photoId =
      base.match(/photo-([a-z0-9-]+)/)?.[1] ?? base.split("/").pop();
    if (photoId && !uniquePhotos.has(photoId)) {
      uniquePhotos.set(photoId, base);
    }
  }
}
console.log(`✓  Distinct Unsplash photos to migrate: ${uniquePhotos.size}`);

// 3) For each unique photo: ask Unsplash for a sized WebP, then put it
//    in Supabase storage. We cache the photoId → new URL mapping.
const migratedMap = new Map(); // unsplashId → new public Supabase URL
let nDownloaded = 0;
let nErr = 0;
for (const [photoId, baseUrl] of uniquePhotos) {
  const sizedUrl = `${baseUrl}?w=${TARGET_WIDTH}&q=${TARGET_QUALITY}&fm=webp&fit=crop&auto=format`;
  let buf;
  try {
    const r = await fetch(sizedUrl);
    if (!r.ok) {
      console.warn(`✗  ${photoId} fetch ${r.status}`);
      nErr++;
      continue;
    }
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.warn(`✗  ${photoId} fetch error — ${e.message}`);
    nErr++;
    continue;
  }
  const objectPath = `${PREFIX}${photoId}.webp`;
  // upsert:true because re-running the migration shouldn't fail on
  // already-uploaded photos — it's idempotent by design.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buf, { contentType: "image/webp", upsert: true });
  if (uploadErr) {
    console.warn(`✗  ${photoId} upload — ${uploadErr.message}`);
    nErr++;
    continue;
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  migratedMap.set(photoId, pub.publicUrl);
  nDownloaded++;
  console.log(
    `✓  ${photoId.padEnd(15)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB → ${pub.publicUrl}`,
  );
}

console.log(`\n✓  Re-hosted ${nDownloaded} photos (${nErr} failed)\n`);

// 4) Rewrite every auction's image_urls. Same array order, same length,
//    but each Unsplash URL replaced with its new Supabase URL. Photos
//    we couldn't migrate are left alone (the site keeps working).
let auctionsUpdated = 0;
for (const row of auctions ?? []) {
  const before = row.image_urls ?? [];
  let changed = false;
  const after = before.map((u) => {
    if (!u.startsWith("https://images.unsplash.com/")) return u;
    const photoId = u.split("?")[0].match(/photo-([a-z0-9-]+)/)?.[1] ?? null;
    const newUrl = photoId ? migratedMap.get(photoId) : null;
    if (newUrl) {
      changed = true;
      return newUrl;
    }
    return u;
  });
  if (!changed) continue;
  const { error: updErr } = await supabase
    .from("auctions")
    .update({ image_urls: after })
    .eq("id", row.id);
  if (updErr) {
    console.warn(`✗  auction ${row.id} update — ${updErr.message}`);
    continue;
  }
  auctionsUpdated++;
}

console.log(`✓  Rewrote ${auctionsUpdated} auction rows.\n`);
console.log("Done. Refresh the home page — images should now load from the");
console.log("Supabase render-image endpoint, much faster from Tunisia.");
process.exit(nErr > 0 ? 1 : 0);
