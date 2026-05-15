// Optimize every PNG in ../marques/ → ../marques-optimized/.
//
// What it does:
//   - Strips embedded ICC color profiles (some are 7 KB on a 26 KB file)
//   - Drops every other metadata chunk (EXIF, XMP, comments)
//   - Quantizes to a palette PNG (logos use at most a few dozen colors;
//     palette PNGs are 3-10× smaller than truecolor for the same look)
//   - Keeps the alpha channel so logos still composite on white
//   - Same dimensions as the source (115×100 from automobile.tn) —
//     re-rendering happens server-side via Supabase's image transform
//
// Run from web/:
//   node scripts/optimize-brand-logos.mjs

import sharp from "sharp";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, "..", "..", "marques");
const OUT_DIR = resolve(__dirname, "..", "..", "marques-optimized");

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR).filter((f) => extname(f).toLowerCase() === ".png");
console.log(`Optimizing ${files.length} PNGs from ${SRC_DIR}`);
console.log(`Output dir: ${OUT_DIR}\n`);

let totalBefore = 0;
let totalAfter = 0;
let worstRatio = 1;
let bestSaving = 0;

for (const name of files) {
  const srcPath = join(SRC_DIR, name);
  const dstPath = join(OUT_DIR, name);
  const before = readFileSync(srcPath).length;
  totalBefore += before;

  // palette: true → indexed PNG (small).
  // quality 90 + colours 128 → visually lossless for logos (we tested
  // 64 colours and a few brand gradients banded).
  // compressionLevel 9 → max zlib effort, small CPU cost on 56 files.
  const buf = await sharp(srcPath)
    .png({
      palette: true,
      quality: 90,
      colours: 128,
      compressionLevel: 9,
      effort: 10,
    })
    .toBuffer();

  writeFileSync(dstPath, buf);
  totalAfter += buf.length;
  const ratio = buf.length / before;
  if (ratio > worstRatio) worstRatio = ratio;
  const saving = 1 - ratio;
  if (saving > bestSaving) bestSaving = saving;

  const arrow = buf.length < before ? "↓" : "↑";
  console.log(
    `  ${name.padEnd(22)} ${before.toString().padStart(6)} B  ${arrow}  ${buf.length.toString().padStart(6)} B  (${Math.round((ratio - 1) * 100).toString().padStart(4)}%)`,
  );
}

const totalSaving = 1 - totalAfter / totalBefore;
console.log(`\nTotal: ${totalBefore.toLocaleString()} B → ${totalAfter.toLocaleString()} B  ` +
  `(saved ${Math.round(totalSaving * 100)}%)`);
console.log(`Best single file saving: ${Math.round(bestSaving * 100)}%`);
console.log(`Worst ratio: ${Math.round(worstRatio * 100)}% (anything > 100% means the optimizer made the file LARGER)`);
