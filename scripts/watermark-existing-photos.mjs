/**
 * Stamp the mark into every listing photo that was published before
 * `src/lib/watermark.ts` existed.
 *
 * New uploads are stamped in the browser on their way to storage. Everything
 * already in the catalogue — the whole imported back catalogue — is not, and
 * those are the photos that have been public longest and are likeliest to have
 * been lifted already.
 *
 * IT NEVER DESTROYS AN ORIGINAL. Every stamped photo is written to a NEW
 * object under `watermarked/`, and only then does the row move to it. The bytes
 * it pointed at before are left exactly where they were, so reverting is a
 * column update and nothing has to be re-downloaded. The old->new mapping is
 * written to `scripts/watermark-backfill.log.json` for exactly that purpose.
 *
 * IT ALSO BRINGS THE PHOTOS HOME. 462 of the 536 rows hold an absolute URL into
 * `erosazbplfhelvxweeyz` — a DIFFERENT Supabase project from the one this app
 * runs on, kept as "FUTURE / STANDBY" in the sibling repo's env. Most of the
 * catalogue's images were one bucket policy change away from vanishing from a
 * site that holds no credentials for that project. They land in our own
 * `properties` bucket on the way through.
 *
 * WHY THE ALPHA IS SCALED BY HAND. The browser draws the mark under
 * `ctx.globalAlpha`. The obvious equivalent here is sharp's
 * `composite({ opacity })` — which is a no-op in sharp 0.34.5: opacity 1, 0.5,
 * 0.3 and 0.1 over the same input all produce a byte-identical result. It fails
 * silently, so a backfill written the obvious way would have burnt a fully
 * opaque logo into all 536 photos and nothing would have complained. The alpha
 * channel is multiplied directly instead, which is what globalAlpha does
 * (scripts/watermark-recipe.mjs, which both backfills share).
 *
 *   node scripts/watermark-existing-photos.mjs            # report only
 *   node scripts/watermark-existing-photos.mjs --limit 3  # try a few
 *   node scripts/watermark-existing-photos.mjs --commit   # do it
 *
 * Re-running after a settings change needs no flag: bump VERSION, and every
 * row not yet on that version is re-stamped FROM ITS ORIGINAL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { VERSION, stampCorner } from "./watermark-recipe.mjs";

loadEnv({ path: ".env.local" });

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOG = path.join(ROOT, "scripts", "watermark-backfill.log.json");

const BUCKET = "properties";
/**
 * Stamped objects are versioned, and re-stamping writes a NEW path.
 *
 * Uploads carry `Cache-Control: 31536000`, so overwriting an object in place
 * leaves every CDN edge and every browser that has seen it serving the old
 * picture for a year. The row has to move to a URL nothing has cached — which
 * also means the previous version stays on disk, and a bad batch is undone by
 * pointing the rows back at it.
 */
const PREFIX = "watermarked/";
// The version comes with the recipe: v4 is the colour emblem in the corner
// (v3 the grey logo in the middle, v2 the « MA » monogram over its caption).
const CURRENT = `${PREFIX}${VERSION}/`;

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || Infinity;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function allPhotos() {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(
      `${SB_URL}/rest/v1/listing_photos?select=id,listing_id,storage_path,created_at&order=id&limit=1000&offset=${offset}`,
      { headers: H },
    );
    if (!r.ok) throw new Error(`listing_photos read failed: ${r.status} ${await r.text()}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** Absolute URLs are fetched as-is; bucket-relative paths via the public object API. */
function sourceUrl(storagePath) {
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${storagePath.replace(/^\/+/, "")}`;
}

async function upload(objectPath, body) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      ...H,
      "Content-Type": "image/webp",
      "x-upsert": "true",
      "Cache-Control": "31536000",
    },
    body,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: ${r.status} ${await r.text()}`);
}

async function repoint(id, storagePath) {
  const r = await fetch(`${SB_URL}/rest/v1/listing_photos?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ storage_path: storagePath }),
  });
  if (!r.ok) throw new Error(`patch ${id}: ${r.status} ${await r.text()}`);
}

const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];

/**
 * Where a row's UNSTAMPED bytes live.
 *
 * This is the whole reason the backfill writes to a new object instead of
 * overwriting: the strength was tuned twice, and re-stamping an
 * already-stamped photo would have compounded the mark instead of replacing
 * it. The log maps every row back to the bytes it started from, and those
 * bytes were never touched, so a re-run at a new opacity is a fresh stamp on
 * the original rather than a stamp on a stamp.
 */
const originalOf = new Map(log.map((e) => [e.id, e.from]));

/**
 * Was this row's photo stamped in the browser when it was uploaded? Every
 * upload since lib/watermark.ts shipped (8 September 2026, the first backfill)
 * was, and the bytes in storage are the only ones there are. Rows from before
 * are the back catalogue, which the first run stamped from originals it kept.
 */
const WATERMARK_SHIPPED = Date.parse("2026-09-09T00:00:00Z");
function wasStampedAtUpload(row) {
  return row.storage_path.startsWith(PREFIX) || Date.parse(row.created_at) >= WATERMARK_SHIPPED;
}

const rows = await allPhotos();
const pending = rows.filter((r) => r.storage_path && !r.storage_path.startsWith(CURRENT));
// Only rows whose UNSTAMPED original is known. A photo uploaded through the
// site was stamped in the browser on its way to storage and no clean copy was
// kept: stamping it again would put the new mark on top of the old one.
// Those are left as they are.
const todo = pending.filter((r) => originalOf.has(r.id) || !wasStampedAtUpload(r));
const noOriginal = pending.length - todo.length;
const foreign = todo.filter((r) => /^https?:\/\//.test(originalOf.get(r.id) ?? r.storage_path)).length;

console.log(
  `${rows.length} photos, ${rows.length - pending.length} already on ${VERSION}, ${todo.length} to do`,
);
if (noOriginal) {
  console.log(`  ${noOriginal} stamped at upload with no original kept: left as they are`);
}
console.log(
  `  ${foreign} hosted on another Supabase project, ${todo.length - foreign} in our own bucket`,
);
// A host that no longer answers holds originals that are gone: the other
// Supabase project above was deleted (its name stopped resolving in October
// 2026). Its rows keep the photo they have rather than fail one by one.
const deadHosts = new Set();
for (const host of new Set(todo.map((r) => new URL(sourceUrl(originalOf.get(r.id) ?? r.storage_path)).host))) {
  try {
    await fetch(`https://${host}/`, { method: "HEAD" });
  } catch {
    deadHosts.add(host);
  }
}
const reachable = todo.filter(
  (r) => !deadHosts.has(new URL(sourceUrl(originalOf.get(r.id) ?? r.storage_path)).host),
);
if (deadHosts.size) {
  console.log(
    `  ${todo.length - reachable.length} with their original on a host that no longer answers (${[...deadHosts].join(", ")}): left as they are`,
  );
}
if (!COMMIT) console.log("DRY RUN — pass --commit to write.\n");

const planned = reachable.slice(0, LIMIT === Infinity ? undefined : LIMIT);
let done = 0;
let failed = 0;

for (const row of planned) {
  const dest = `${CURRENT}${row.listing_id}/${row.id}.webp`;
  const from = originalOf.get(row.id) ?? row.storage_path;
  try {
    const res = await fetch(sourceUrl(from));
    if (!res.ok) throw new Error(`source ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    const stamped = await stampCorner(original);

    if (COMMIT) {
      await upload(dest, stamped);
      if (row.storage_path !== dest) await repoint(row.id, dest);
      if (!originalOf.has(row.id)) {
        originalOf.set(row.id, from);
        log.push({ id: row.id, from, to: dest, at: new Date().toISOString() });
      }
    }
    done += 1;
    if (done % 25 === 0 || done === planned.length || !COMMIT) {
      console.log(`  ${done}/${planned.length}  ${from.slice(-48)} -> ${dest}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`  FAILED ${row.id} (${from}): ${err.message}`);
  }
}

if (COMMIT) fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
console.log(`\n${COMMIT ? "stamped" : "would stamp"} ${done}, failed ${failed}`);
if (COMMIT) console.log(`mapping written to ${path.relative(ROOT, LOG)}`);
