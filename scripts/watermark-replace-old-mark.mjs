/**
 * Replace the old « MA » watermark with the current one on photos whose
 * unstamped original no longer exists.
 *
 * watermark-existing-photos.mjs re-stamps a photo FROM ITS ORIGINAL. For most
 * of the live catalogue that original sat on the other Supabase project
 * (erosazbplfhelvxweeyz), which has been deleted, so all that is left is the
 * v2 stamped copy. This script takes the mark OUT of that copy and then puts
 * the current one in (scripts/watermark-recipe.mjs: the colour emblem, top-left).
 *
 * HOW THE OLD MARK COMES OUT. The v2 files were all written by one recipe —
 * watermark-existing-photos.mjs at 4d7a074: the « MA » stamp (with its caption
 * from 1000px wide, the bare monogram below), 30% of the width, at least 96px,
 * centred, at 18%, over a blurred black silhouette of itself. Every number is
 * known, so the composite can be undone pixel by pixel:
 *
 *   stamped = mark·a + (original·(1 − s))·(1 − a)
 *   original = (stamped − mark·a) / ((1 − a)·(1 − s))
 *
 * The silhouette was meant to be 10% (0.55 × 18%) but went in at full
 * strength: sharp's `linear()` did not scale that single band. In the core of
 * the thickest strokes it was nearly opaque and the original is gone there;
 * dividing would only amplify compression noise. Those pixels (and 2px
 * around them) are filled from their neighbours instead: a straight line
 * across each masked run of a row, then smoothed.
 *
 * Checked against the three photos whose originals survive: the error inside
 * the mark's box falls from ~22 to ~4 (of 255). At normal size nothing shows;
 * zoomed, faint traces remain where the strokes were, mostly on white paint.
 *
 * IT NEVER DESTROYS ANYTHING. The new photo goes to a NEW object under
 * `watermarked/<VERSION>/`; the v2 object, and any earlier result, stays where
 * it is. Each move is written to `scripts/watermark-replace.log.json` (the
 * row's previous path, and the v2 file it was made from), so undoing is
 * pointing the rows back one step:
 *
 *   node scripts/watermark-replace-old-mark.mjs            # report only
 *   node scripts/watermark-replace-old-mark.mjs --limit 3  # try a few, no writes
 *   node scripts/watermark-replace-old-mark.mjs --commit [--limit N]
 *   node scripts/watermark-replace-old-mark.mjs --undo --commit
 *
 * Every row made from a v2 file is redone from that v2 file whenever the
 * recipe's VERSION moves on — never from a previous result, which would carry
 * its mark along. The first run (v3, the grey logo) did published listings
 * only; v4 does them all.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { config as loadEnv } from "dotenv";
import { VERSION, stampCorner } from "./watermark-recipe.mjs";

loadEnv({ path: ".env.local" });

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOG = path.join(ROOT, "scripts", "watermark-replace.log.json");
const BUCKET = "properties";
const FROM = "watermarked/v2/";
const TO = `watermarked/${VERSION}/`;

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const UNDO = args.includes("--undo");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || Infinity;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// ── The v2 recipe (watermark-existing-photos.mjs at 4d7a074) ────────────────
const V2 = { commit: "4d7a074", ratio: 0.3, min: 96, opacity: 0.18, captionMin: 1000 };
const fromGit = (file) => execFileSync("git", ["show", `${V2.commit}:${file}`], { cwd: ROOT, maxBuffer: 1 << 26 });
const V2_STAMP = fromGit("public/logo-stamp.png");
const V2_PLAIN = fromGit("public/logo-mark.png");

// The current watermark: scripts/watermark-recipe.mjs, shared with the
// other backfill and mirroring src/lib/watermark.ts.

/** Where a pixel is this dark under the old mark, its original is treated as lost. */
const LOST = 0.08;
/** And this many pixels around it, where the compression noise is loudest. */
const GROW = 2;

const layerCache = new Map();
async function v2Layers(W, H) {
  const file = W >= V2.captionMin ? V2_STAMP : V2_PLAIN;
  const meta = await sharp(file).metadata();
  const aspect = meta.height / meta.width;
  let w = Math.min(Math.max(V2.min, Math.round(W * V2.ratio)), W);
  if (Math.round(w * aspect) > H) w = Math.round(H / aspect);
  const key = `${file === V2_STAMP ? "s" : "p"}${w}`;
  let layers = layerCache.get(key);
  if (!layers) {
    const resized = await sharp(file).resize({ width: w }).ensureAlpha().png().toBuffer();
    const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true });
    const mark = Buffer.from(data);
    for (let i = 3; i < mark.length; i += 4) mark[i] = Math.round(mark[i] * V2.opacity);
    // Exactly as v2 built it — which is how it ended up at full strength.
    const blur = Math.max(6, Math.round(w * 0.035));
    const shadow = await sharp(await sharp(resized).extractChannel(3).blur(blur / 2).linear(0.55 * V2.opacity, 0).toBuffer())
      .extractChannel(0).raw().toBuffer();
    layers = { mark, shadow, mw: info.width, mh: info.height };
    layerCache.set(key, layers);
  }
  const x = Math.round((W - layers.mw) / 2);
  const y = Math.round((H - layers.mh) / 2);
  return { ...layers, x, y, sy: y + Math.max(1, Math.round(layers.mw * 0.006)) };
}

/** The photo as it was before the v2 stamp, as nearly as it can be recovered. Raw RGB. */
async function removeOldMark(stamped) {
  const { data, info } = await sharp(stamped).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, Hh = info.height;
  const L = await v2Layers(W, Hh);
  const px = Float64Array.from(data);
  const keep = new Float64Array(W * Hh).fill(1);
  const inside = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < Hh;

  for (let j = 0; j < L.mh; j++) for (let i = 0; i < L.mw; i++) {
    const X = L.x + i, Y = L.y + j;
    const a = L.mark[(j * L.mw + i) * 4 + 3] / 255;
    if (a > 0 && inside(X, Y)) {
      const p = (Y * W + X) * 3;
      for (let c = 0; c < 3; c++) px[p + c] = (px[p + c] - L.mark[(j * L.mw + i) * 4 + c] * a) / (1 - a);
      keep[Y * W + X] *= 1 - a;
    }
  }
  for (let j = 0; j < L.mh; j++) for (let i = 0; i < L.mw; i++) {
    const X = L.x + i, Y = L.sy + j;
    const s = L.shadow[j * L.mw + i] / 255;
    if (s > 0 && inside(X, Y)) {
      const p = (Y * W + X) * 3;
      for (let c = 0; c < 3; c++) px[p + c] = px[p + c] / (1 - s);
      keep[Y * W + X] *= 1 - s;
    }
  }

  let lost = new Uint8Array(W * Hh);
  for (let p = 0; p < W * Hh; p++) if (keep[p] < LOST) lost[p] = 1;
  for (let g = 0; g < GROW; g++) {
    const next = Uint8Array.from(lost);
    for (let p = 0; p < W * Hh; p++) {
      if (!lost[p]) continue;
      const X = p % W;
      if (X > 0) next[p - 1] = 1;
      if (X < W - 1) next[p + 1] = 1;
      if (p >= W) next[p - W] = 1;
      if (p < W * (Hh - 1)) next[p + W] = 1;
    }
    lost = next;
  }
  const masked = [];
  for (let p = 0; p < W * Hh; p++) if (lost[p]) masked.push(p);

  // A straight line across each masked run of a row, between the good pixels
  // either side: the strokes are thin and mostly upright. Then smooth.
  const fill = Float64Array.from(px);
  for (let Y = 0; Y < Hh; Y++) {
    let X = 0;
    while (X < W) {
      if (!lost[Y * W + X]) { X++; continue; }
      const a = X - 1;
      let b = X;
      while (b < W && lost[Y * W + b]) b++;
      for (let k = X; k < b; k++) {
        const t = (k - a) / (b - a);
        for (let c = 0; c < 3; c++) {
          const va = a >= 0 ? px[(Y * W + a) * 3 + c] : null;
          const vb = b < W ? px[(Y * W + b) * 3 + c] : null;
          const v = va == null ? vb : vb == null ? va : va + (vb - va) * t;
          fill[(Y * W + k) * 3 + c] = Math.max(0, Math.min(255, v ?? 128));
        }
      }
      X = b;
    }
  }
  for (let it = 0; it < 60; it++) {
    for (const p of masked) {
      const X = p % W, Y = (p / W) | 0;
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const XX = X + dx, YY = Y + dy;
          if (!inside(XX, YY)) continue;
          const q = YY * W + XX;
          s += lost[q] ? fill[q * 3 + c] : px[q * 3 + c];
          n++;
        }
        fill[p * 3 + c] = s / n;
      }
    }
  }
  for (const p of masked) for (let c = 0; c < 3; c++) px[p * 3 + c] = fill[p * 3 + c];

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
  return { raw: out, W, H: Hh };
}

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${pathAndQuery}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function repoint(id, storagePath) {
  await rest(`listing_photos?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ storage_path: storagePath }),
  });
}

async function upload(objectPath, body) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "31536000" },
    body,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: ${r.status} ${await r.text()}`);
}

const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];

if (UNDO) {
  // One step back: each row this script moved returns to the photo it had
  // before its LATEST move (v4 -> v3, and a second --undo v3 -> v2).
  const latest = new Map();
  for (const e of log) if (!e.undone) latest.set(e.id, e);
  const todo = [...latest.values()];
  console.log(`${todo.length} rows to point back one step${COMMIT ? "" : " (DRY RUN)"}`);
  let n = 0;
  for (const e of todo.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    if (COMMIT) {
      await repoint(e.id, e.from);
      e.undone = new Date().toISOString();
    }
    n += 1;
  }
  if (COMMIT) fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
  console.log(`${COMMIT ? "pointed back" : "would point back"} ${n}`);
  process.exit(0);
}

const photos = [];
for (let offset = 0; ; offset += 1000) {
  const page = await rest(`listing_photos?select=id,listing_id,storage_path&order=id&limit=1000&offset=${offset}`);
  photos.push(...page);
  if (page.length < 1000) break;
}
// The v2 file each row's photo comes from: the row itself while it is still
// on v2, or the first move this script made of it.
const v2Of = new Map();
for (const e of log) if (!v2Of.has(e.id) && (e.source ?? e.from).startsWith(FROM)) v2Of.set(e.id, e.source ?? e.from);
const todo = photos
  .filter((p) => p.storage_path && !p.storage_path.startsWith(TO))
  .map((p) => ({ ...p, source: p.storage_path.startsWith(FROM) ? p.storage_path : v2Of.get(p.id) }))
  .filter((p) => p.source);
console.log(`${todo.length} photos made from a v2 file are not on ${VERSION} yet`);
if (!COMMIT) console.log("DRY RUN — pass --commit to write.\n");

let done = 0, failed = 0;
const planned = todo.slice(0, LIMIT === Infinity ? undefined : LIMIT);
for (const row of planned) {
  const dest = `${TO}${row.listing_id}/${row.id}.webp`;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/public/${BUCKET}/${row.source}`);
    if (!r.ok) throw new Error(`source ${r.status}`);
    const cleaned = await removeOldMark(Buffer.from(await r.arrayBuffer()));
    const stamped = await stampCorner(cleaned.raw, { width: cleaned.W, height: cleaned.H, channels: 3 });
    if (COMMIT) {
      await upload(dest, stamped);
      await repoint(row.id, dest);
      log.push({ id: row.id, listing_id: row.listing_id, from: row.storage_path, source: row.source, to: dest, at: new Date().toISOString() });
      if (done % 10 === 0) fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
    }
    done += 1;
    if (done % 25 === 0 || done === planned.length || !COMMIT) {
      console.log(`  ${done}/${planned.length}  ${row.source} -> ${dest}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`  FAILED ${row.id} (${row.storage_path}): ${err.message}`);
  }
}
if (COMMIT) fs.writeFileSync(LOG, JSON.stringify(log, null, 2));
console.log(`\n${COMMIT ? "replaced" : "would replace"} ${done}, failed ${failed}`);
if (COMMIT) console.log(`undo log: ${path.relative(ROOT, LOG)}`);
