// Fix the auction walkaround videos. The inventory found 7 of them
// stored as `.mov` / video/quicktime — Chrome (Android + desktop)
// CANNOT play the QuickTime container, only Safari can. That's why
// the video player sat black at 0:00 for most users.
//
// This re-encodes every video in auction-media to a clean,
// Chrome-friendly H.264 MP4:
//   • H.264 video (yuv420p) + AAC audio  → universal playback
//   • capped at 1280px wide, CRF 28      → ~5 MB .mov shrinks to ~1-2 MB
//   • -movflags +faststart               → moov atom up front, so the
//     player can START before the whole file downloads (kills the
//     "takes ages to load" problem)
//
// Overwrites IN PLACE (same storage path) with contentType=video/mp4
// so every video_url already stored in the DB keeps resolving — the
// .mov extension becomes cosmetic, browsers read the Content-Type.
//
// SAFETY: project-ref gated, DRY RUN by default, per-file retry,
// idempotent (skips files that are already small faststart MP4).
//
// Run:  node scripts/remux-videos.mjs            (dry run)
//       node scripts/remux-videos.mjs --apply    (do it)
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";
const APPLY = process.argv.includes("--apply");

// ffmpeg-static binary — installed in an isolated temp prefix because
// the project's npm tree wouldn't resolve a new dep cleanly. If you
// move/clean that temp dir, re-point this or `npm i -D ffmpeg-static`.
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\Med Saief Allah\\AppData\\Local\\Temp\\fftmp\\node_modules\\ffmpeg-static\\ffmpeg.exe";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(label, fn, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        console.log(`     ↻ retry ${i} (${label}): ${e.message}`);
        await sleep(i * 1500);
      }
    }
  }
  throw lastErr;
}

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
      acc.push({
        path,
        size: entry.metadata?.size ?? 0,
        mime: entry.metadata?.mimetype ?? "?",
      });
    } else {
      await walk(path, acc);
    }
  }
  return acc;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

const files = (await walk()).filter((f) => VIDEO_RE.test(f.path));
console.log(
  `${APPLY ? "APPLY" : "DRY RUN"} — ${files.length} video objects in ${BUCKET}\n`,
);

let processed = 0;
let skipped = 0;
let failed = 0;
let bytesBefore = 0;
let bytesAfter = 0;
const tmp = mkdtempSync(join(tmpdir(), "remux-"));

for (const f of files) {
  // Already a smallish mp4? Leave it — re-encoding loses quality for
  // no real win. We only KNOW it's faststart-safe if we re-encode,
  // but a <2.5 MB mp4 plays fine and isn't worth the churn.
  if (f.mime === "video/mp4" && f.size < 2.5 * 1024 * 1024) {
    skipped++;
    continue;
  }

  const inPath = join(tmp, "in" + (f.path.match(/\.[a-z0-9]+$/i)?.[0] ?? ".bin"));
  const outPath = join(tmp, "out.mp4");

  // Download.
  let srcBuf;
  try {
    srcBuf = await withRetry(`download ${f.path}`, async () => {
      const { data: blob, error } = await svc.storage
        .from(BUCKET)
        .download(f.path);
      if (error || !blob) throw new Error(error?.message ?? "no data");
      return Buffer.from(await blob.arrayBuffer());
    });
  } catch (e) {
    console.log(`  ❌ download failed: ${f.path} — ${e.message}`);
    failed++;
    continue;
  }
  writeFileSync(inPath, srcBuf);

  // Re-encode → Chrome-friendly streamable MP4.
  try {
    await execFileP(
      FFMPEG,
      [
        "-i", inPath,
        // Cap width at 1280, keep aspect, force even dims (libx264 needs it)
        "-vf", "scale='min(1280,iw)':-2",
        "-c:v", "libx264",
        "-crf", "28",
        "-preset", "medium",
        "-pix_fmt", "yuv420p", // max device compatibility
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart", // stream-before-fully-downloaded
        "-y",
        outPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    );
  } catch (e) {
    console.log(`  ⚠ ffmpeg failed: ${f.path} — ${String(e.message).slice(0, 120)}`);
    failed++;
    continue;
  }

  const outBuf = readFileSync(outPath);
  bytesBefore += f.size;
  bytesAfter += outBuf.length;
  processed++;
  const pct = Math.round((1 - outBuf.length / f.size) * 100);
  console.log(
    `  ${APPLY ? "✓" : "·"} ${mb(f.size).padStart(10)} → ${mb(outBuf.length).padStart(10)}  (-${pct}%)  ${f.mime} → video/mp4   ${f.path}`,
  );

  if (APPLY) {
    try {
      await withRetry(`upload ${f.path}`, async () => {
        const { error } = await svc.storage
          .from(BUCKET)
          .upload(f.path, outBuf, {
            contentType: "video/mp4",
            upsert: true,
            cacheControl: "31536000",
          });
        if (error) throw new Error(error.message);
      });
    } catch (e) {
      console.log(`     ❌ upload failed: ${e.message}`);
      failed++;
      processed--;
      bytesBefore -= f.size;
      bytesAfter -= outBuf.length;
    }
  }
}

rmSync(tmp, { recursive: true, force: true });

console.log(
  `\n${APPLY ? "Applied" : "Would process"}: ${processed}   skipped: ${skipped}   failed: ${failed}`,
);
if (processed > 0) {
  console.log(
    `Video storage: ${mb(bytesBefore)} → ${mb(bytesAfter)}  (-${Math.round((1 - bytesAfter / bytesBefore) * 100)}%)`,
  );
}
if (!APPLY) console.log("\nDRY RUN — re-run with --apply to overwrite.");
