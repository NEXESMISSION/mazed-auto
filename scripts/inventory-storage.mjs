// One-shot inventory of the `auction-media` Supabase Storage bucket.
// Reports file count, total size, format breakdown, and the fattest
// files — so we know what's worth re-compressing.
//
// Read-only. Project-ref gated. Run: node scripts/inventory-storage.mjs
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

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKETS = ["auction-media", "cms-brand-logos", "cms-images"];

/** Recursively walk a bucket folder, collecting file metadata. */
async function walk(bucket, prefix = "", acc = []) {
  const { data, error } = await svc.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    console.log(`  (cannot list ${bucket}/${prefix}: ${error.message})`);
    return acc;
  }
  for (const entry of data ?? []) {
    // A "folder" has no metadata / id; a file has metadata.size.
    const isFile = entry.id !== null && entry.metadata != null;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isFile) {
      acc.push({
        bucket,
        path,
        size: entry.metadata?.size ?? 0,
        mime: entry.metadata?.mimetype ?? "?",
      });
    } else {
      await walk(bucket, path, acc);
    }
  }
  return acc;
}

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

for (const bucket of BUCKETS) {
  console.log(`\n━━━ bucket: ${bucket} ━━━`);
  const files = await walk(bucket);
  if (files.length === 0) {
    console.log("  (empty or inaccessible)");
    continue;
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`  files:  ${files.length}`);
  console.log(`  total:  ${fmtMB(total)}`);
  console.log(`  avg:    ${fmtKB(total / files.length)}`);

  // Format breakdown
  const byExt = {};
  for (const f of files) {
    const ext = (f.path.split(".").pop() ?? "?").toLowerCase();
    byExt[ext] = byExt[ext] ?? { count: 0, bytes: 0 };
    byExt[ext].count++;
    byExt[ext].bytes += f.size;
  }
  console.log("  by format:");
  for (const [ext, d] of Object.entries(byExt).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`    .${ext.padEnd(5)} ${String(d.count).padStart(4)} files  ${fmtMB(d.bytes).padStart(10)}  (avg ${fmtKB(d.bytes / d.count)})`);
  }

  // Size buckets
  const buckets = { "<100KB": 0, "100-300KB": 0, "300KB-1MB": 0, "1-5MB": 0, ">5MB": 0 };
  for (const f of files) {
    if (f.size < 100 * 1024) buckets["<100KB"]++;
    else if (f.size < 300 * 1024) buckets["100-300KB"]++;
    else if (f.size < 1024 * 1024) buckets["300KB-1MB"]++;
    else if (f.size < 5 * 1024 * 1024) buckets["1-5MB"]++;
    else buckets[">5MB"]++;
  }
  console.log("  size distribution:");
  for (const [label, count] of Object.entries(buckets)) {
    if (count > 0) console.log(`    ${label.padEnd(12)} ${count}`);
  }

  // Top 10 fattest
  const fat = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
  console.log("  fattest 10:");
  for (const f of fat) {
    console.log(`    ${fmtKB(f.size).padStart(9)}  ${f.mime.padEnd(16)} ${f.path}`);
  }

  // Re-compression candidates: images > 250KB that aren't already
  // a transformed-render output (those live behind the render
  // endpoint, not in the bucket as files).
  const imgCandidates = files.filter(
    (f) =>
      /\.(jpe?g|png)$/i.test(f.path) && f.size > 250 * 1024,
  );
  const webpCandidates = files.filter(
    (f) => /\.webp$/i.test(f.path) && f.size > 400 * 1024,
  );
  console.log(
    `  re-compress candidates: ${imgCandidates.length} JPEG/PNG >250KB, ${webpCandidates.length} WebP >400KB`,
  );
}

console.log("\nDone.");
