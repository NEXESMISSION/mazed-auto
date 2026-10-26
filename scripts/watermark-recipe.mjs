/**
 * The photo watermark as the backfill scripts stamp it — the same mark, place
 * and strength as src/lib/watermark.ts draws on new uploads. The two must
 * agree, or an old photo and a new one side by side on the same page look
 * stamped by two different sites. Change one, change the other.
 *
 * The ring emblem in colour (brand/<version>/mark.png), 13% of the width, in
 * the top-left corner inside a margin of 3% of the shorter side, at 92%, over
 * a soft black shadow at 35%.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const MARK_WIDTH_RATIO = 0.13;
export const MIN_MARK_PX = 56;
export const MARGIN_RATIO = 0.03;
export const MARK_OPACITY = 0.92;
const SHADOW_OPACITY = 0.35;

/** Folder of the current version prefix stamped photos are written under. */
export const VERSION = "v4";

/** The current logo folder, as scripts/regen-logos.mjs wrote it into src/lib/brand.ts. */
export const MARK_FILE = (() => {
  const m = fs.readFileSync(path.join(ROOT, "src", "lib", "brand.ts"), "utf8").match(/BRAND_DIR = "\/(brand\/[^"]+)"/);
  if (!m) throw new Error("src/lib/brand.ts has no BRAND_DIR: run node scripts/regen-logos.mjs first");
  return path.join(ROOT, "public", ...m[1].split("/"), "mark.png");
})();

/** cornerRect in src/lib/watermark.ts. */
export function cornerRect(width, height, aspect) {
  const margin = Math.round(Math.min(width, height) * MARGIN_RATIO);
  let w = Math.min(Math.max(MIN_MARK_PX, Math.round(width * MARK_WIDTH_RATIO)), width - 2 * margin);
  let h = Math.round(w * aspect);
  if (h > height - 2 * margin) {
    h = Math.max(1, height - 2 * margin);
    w = Math.round(h / aspect);
  }
  return { x: margin, y: margin, w: Math.max(1, w), h };
}

const layers = new Map();
/** The mark at width `w`, faded, and its shadow — built once per size. */
async function markAt(w) {
  if (layers.has(w)) return layers.get(w);
  const resized = await sharp(MARK_FILE).resize({ width: w }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const mark = Buffer.from(resized.data);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = mark[i * 4 + 3];
    mark[i * 4 + 3] = Math.round(mark[i * 4 + 3] * MARK_OPACITY);
  }
  // The canvas draws its shadow from the mark's alpha, blurred by shadowBlur
  // (a Gaussian of sigma ≈ blur / 2), under the same globalAlpha. Scaled here
  // in JS rather than with sharp's linear(), which does not scale a single
  // band — the bug that put the old mark's shadow in at full strength.
  const blur = Math.max(2, Math.round(w * 0.04));
  // sharp hands a one-band raw input back as sRGB (three bands), so the
  // stride is read from the result rather than assumed: read as one band, the
  // shadow came out as a striped grey box.
  const blurred = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.3, blur / 2))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stride = blurred.info.channels;
  const shadow = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) shadow[i * 4 + 3] = Math.round(blurred.data[i * stride] * SHADOW_OPACITY * MARK_OPACITY);
  const out = {
    mark: await sharp(mark, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    shadow: await sharp(shadow, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    width,
    height,
  };
  layers.set(w, out);
  return out;
}

/**
 * Stamp a photo (an encoded image, or raw RGB with `raw`) and return WebP.
 */
export async function stampCorner(input, raw) {
  const img = raw ? sharp(input, { raw }) : sharp(input);
  const { width: W, height: H } = raw ?? (await sharp(input).metadata());
  const meta = await sharp(MARK_FILE).metadata();
  const r = cornerRect(W, H, meta.height / meta.width);
  const m = await markAt(r.w);
  // Never past the edge, even if rounding made the mark a pixel taller.
  const offset = Math.max(1, Math.round(r.w * 0.01));
  const fits = (top, h) => top + h <= H;
  const parts = [];
  if (fits(r.y + offset, m.height)) parts.push({ input: m.shadow, left: r.x, top: r.y + offset });
  if (fits(r.y, m.height)) parts.push({ input: m.mark, left: r.x, top: r.y });
  return img.composite(parts).webp({ quality: 90 }).toBuffer();
}
