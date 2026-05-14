// Re-compress every fat image already sitting in the `auction-media`
// bucket. Downloads each source, re-encodes to WebP via Sharp, and
// overwrites it AT THE SAME PATH (so the URLs stored in the DB —
// auctions.image_urls, kyc_submissions, etc. — keep resolving). The
// content-type is set to image/webp; the .jpg/.png extension in the
// path becomes cosmetic but harmless (the render endpoint + browsers
// both read the actual bytes / the Content-Type header, not the
// extension).
//
// Videos (.mov/.mp4/.webm) are skipped — browser-uploaded video can't
// be transcoded here without ffmpeg, and it's one clip per auction
// (lazy-loaded), not 60-per-page like photos.
//
// SAFETY:
//   • Project-ref gated to erosazbplfhelvxweeyz.
//   • DRY RUN by default — prints what it WOULD do. Pass --apply to
//     actually overwrite.
//   • Skips files that are already small WebP (idempotent — safe to
//     re-run).
//
// Run:  node scripts/recompress-storage.mjs            (dry run)
//       node scripts/recompress-storage.mjs --apply    (do it)
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";
const APPLY = process.argv.includes("--apply");

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
  console.error(`Project ref mismatch: ${projectRef} — refusing to run.`);
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "auction-media";
const VIDEO_RE = /\.(mov|mp4|webm|m4v|avi)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
// Folder-driven sizing. KYC / carte-grise docs need OCR clarity so
// they get a larger edge + higher quality; auction photos can go
// tighter because they're only ever shown as thumbnails / a gallery.
function paramsForPath(path) {
  if (path.includes("/kyc/") || path.includes("/carte-grise/")) {
    return { maxEdge: 2000, quality: 86 };
  }
  return { maxEdge: 1600, quality: 78 };
}
// Don't bother re-encoding anything already under this — the win
// wouldn't cover the churn, and re-encoding tiny images can grow them.
const SKIP_BELOW = 120 * 1024;

async function walk(prefix = "", acc = []) {
  const { data, error } = await svc.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    console.error(`  list failed ${prefix}: ${error.message}`);
    return acc;
  }
  for (const entry of data ?? []) {
    const isFile = entry.id !== null && entry.metadata != null;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isFile) {
      acc.push({ path, size: entry.metadata?.size ?? 0 });
    } else {
      await walk(path, acc);
    }
  }
  return acc;
}

function kb(n) {
  return `${(n / 1024).toFixed(0)} KB`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry wrapper for the flaky bits (download / upload over the
 * network). Supabase's pooler occasionally drops a TLS connection
 * mid-transfer (ECONNRESET / "terminated") — without a retry the
 * whole run dies on the first blip. 3 attempts with linear backoff.
 */
async function withRetry(label, fn, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        console.log(`     ↻ retry ${i}/${attempts - 1} (${label}): ${msg}`);
        await sleep(i * 1500);
      }
    }
  }
  throw lastErr;
}

const files = await walk();
console.log(
  `${APPLY ? "APPLY" : "DRY RUN"} — ${files.length} objects in ${BUCKET}\n`,
);

let processed = 0;
let skipped = 0;
let failed = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const f of files) {
  if (VIDEO_RE.test(f.path)) {
    skipped++;
    continue;
  }
  if (!IMAGE_RE.test(f.path)) {
    skipped++;
    continue;
  }
  // Already-small webp: leave it.
  if (/\.webp$/i.test(f.path) && f.size < SKIP_BELOW) {
    skipped++;
    continue;
  }

  // Download the source bytes (with retry — the pooler drops TLS
  // connections under sustained transfer).
  let srcBuf;
  try {
    srcBuf = await withRetry(`download ${f.path}`, async () => {
      const { data: blob, error: dlErr } = await svc.storage
        .from(BUCKET)
        .download(f.path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "no data");
      return Buffer.from(await blob.arrayBuffer());
    });
  } catch (e) {
    console.log(`  ❌ download failed: ${f.path} — ${e.message}`);
    failed++;
    continue;
  }

  // Idempotency guard: if the bytes are ALREADY WebP (a previous run
  // overwrote a .jpg path with WebP content), skip — re-encoding
  // WebP→WebP just sheds a little quality for no real size win, and
  // we don't want repeated runs to slowly degrade the image. The
  // path extension lies after the first pass, so we sniff the magic
  // bytes: "RIFF"...."WEBP".
  const isWebpContent =
    srcBuf.length > 12 &&
    srcBuf.toString("ascii", 0, 4) === "RIFF" &&
    srcBuf.toString("ascii", 8, 12) === "WEBP";
  if (isWebpContent && f.size < 400 * 1024) {
    skipped++;
    continue;
  }

  // Re-encode with Sharp.
  const { maxEdge, quality } = paramsForPath(f.path);
  let outBuf;
  try {
    outBuf = await sharp(srcBuf, { failOn: "none" })
      .rotate() // honour EXIF orientation before we strip metadata
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 5 })
      .toBuffer();
  } catch (e) {
    // HEIC without libheif, corrupt file, etc. — leave the original.
    console.log(`  ⚠ encode failed: ${f.path} — ${e.message}`);
    failed++;
    continue;
  }

  // If the re-encode didn't actually save anything meaningful (already
  // optimal), skip the re-upload churn.
  if (outBuf.length >= f.size * 0.95) {
    skipped++;
    continue;
  }

  bytesBefore += f.size;
  bytesAfter += outBuf.length;
  processed++;
  const savedPct = Math.round((1 - outBuf.length / f.size) * 100);
  console.log(
    `  ${APPLY ? "✓" : "·"} ${kb(f.size).padStart(9)} → ${kb(outBuf.length).padStart(9)}  (-${savedPct}%)  ${f.path}`,
  );

  if (APPLY) {
    // Overwrite in place. contentType=image/webp so a direct fetch of
    // the (still .jpg-named) URL serves the right Content-Type and
    // browsers render it. upsert=true to overwrite.
    try {
      await withRetry(`upload ${f.path}`, async () => {
        const { error: upErr } = await svc.storage
          .from(BUCKET)
          .upload(f.path, outBuf, {
            contentType: "image/webp",
            upsert: true,
            cacheControl: "31536000", // 1y — content is immutable per path
          });
        if (upErr) throw new Error(upErr.message);
      });
    } catch (e) {
      console.log(`     ❌ upload failed: ${f.path} — ${e.message}`);
      failed++;
      processed--;
      bytesBefore -= f.size;
      bytesAfter -= outBuf.length;
    }
  }
}

console.log(
  `\n${APPLY ? "Applied" : "Would process"}: ${processed}   skipped: ${skipped}   failed: ${failed}`,
);
if (processed > 0) {
  const savedMB = ((bytesBefore - bytesAfter) / 1024 / 1024).toFixed(1);
  const pct = Math.round((1 - bytesAfter / bytesBefore) * 100);
  console.log(
    `Storage: ${(bytesBefore / 1024 / 1024).toFixed(1)} MB → ${(bytesAfter / 1024 / 1024).toFixed(1)} MB  (saved ${savedMB} MB, -${pct}%)`,
  );
}
if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to overwrite.");
}
