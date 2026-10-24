// Regenerate every Mazed Auto logo asset from the one source file,
// public/brand/mazed-auto-logo.png — the metallic « M » road emblem over the
// « MAZED AUTO » wordmark, 1254x1254 on solid black.
//
//   node scripts/regen-logos.mjs
//   python scripts/make-watermark-stamp.py   # the photo stamp is built from brand/mark.png
//
// WHY THE BLACK IS TURNED INTO ALPHA. The source is opaque. Dropped on the
// site as-is it is a black rectangle, and every surface it sits on (#0a0a0a,
// #141414, a blurred bar, a listing photo for the watermark) is not black. So
// the black is removed by colour-to-alpha against pure black: a pixel's alpha
// is its brightest channel, and its colour is scaled back up to match. Over
// black that composites back to the source byte for byte, which is why the
// gold glow survives as a glow instead of being cut off at a threshold.
//
// THREE ARRANGEMENTS. The emblem alone (`mark`) goes into the square icons
// and the admin console, where the wordmark would be a few pixels tall and
// turn to mush. The full logo (`lockup`) goes where it is shown big and alone:
// sign-in screens, offline page, social previews. The two side by side
// (`lockup-wide`) goes in the site's top bars.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BRAND = path.join(ROOT, "public", "brand");
const APP = path.join(ROOT, "src", "app");
const SRC = path.join(BRAND, "mazed-auto-logo.png");

/** --background. Every opaque tile and the social preview sit on it. */
const BG = "#0a0a0a";
/** The source's black is 0-1; anything this dark is background, not logo. */
const NOISE = 2;
/** Ink threshold for the crop box. Low, so the glow is kept, not clipped. */
const INK = 4;
/** Air left around the ink so the glow fades out instead of hitting the edge. */
const PAD = 6;

const { data: rgb, info } = await sharp(SRC)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

const rgba = Buffer.alloc(W * H * 4);
for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
  const m = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
  if (m <= NOISE) continue;
  rgba[j] = Math.round((rgb[i] * 255) / m);
  rgba[j + 1] = Math.round((rgb[i + 1] * 255) / m);
  rgba[j + 2] = Math.round((rgb[i + 2] * 255) / m);
  rgba[j + 3] = m;
}

const alphaAt = (x, y) => rgba[(y * W + x) * 4 + 3];
const rowInk = (y) => {
  let sum = 0;
  for (let x = 0; x < W; x++) sum += alphaAt(x, y);
  return sum;
};

/** Ink box of the rows [y0, y1), padded and clamped to the image. */
function inkBox(y0, y1) {
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaAt(x, y) <= INK) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`no ink between rows ${y0} and ${y1}`);
  const left = Math.max(0, minX - PAD);
  const top = Math.max(0, minY - PAD);
  return {
    left,
    top,
    width: Math.min(W, maxX + PAD + 1) - left,
    height: Math.min(H, maxY + PAD + 1) - top,
  };
}

// The emblem ends where the wordmark's gap begins: the emptiest row in the
// middle band of the image (the source has ~35 blank rows there).
let split = Math.round(H * 0.5);
for (let y = Math.round(H * 0.5), best = Infinity; y < Math.round(H * 0.65); y++) {
  const ink = rowInk(y);
  if (ink < best) {
    best = ink;
    split = y;
  }
}

const MARK_BOX = inkBox(0, split);
const WORD_BOX = inkBox(split, H);
const LOCKUP_BOX = inkBox(0, H);

const cut = (box) =>
  sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer();
const markFull = await cut(MARK_BOX);
const wordFull = await cut(WORD_BOX);
const lockupFull = await cut(LOCKUP_BOX);

/**
 * The same emblem and wordmark side by side, for the bars. Stacked, the
 * wordmark is a third of the logo's height and unreadable at bar size; next
 * to the emblem it gets most of it. 85% of the emblem's height is where the
 * two read as one logo rather than a picture beside a caption. Built from the
 * source's own wordmark, not set in the site font, so it matches the logo.
 */
async function wideLockup(height) {
  const emblem = await sharp(markFull).resize({ height, kernel: "lanczos3" }).toBuffer();
  const { width: emblemW } = await sharp(emblem).metadata();
  const wordH = Math.round(height * 0.85);
  const word = await sharp(wordFull).resize({ height: wordH, kernel: "lanczos3" }).toBuffer();
  const { width: wordW } = await sharp(word).metadata();
  const gap = Math.round(height * 0.16);
  return sharp({
    create: { width: emblemW + gap + wordW, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: emblem, left: 0, top: 0 },
      { input: word, left: emblemW + gap, top: Math.round((height - wordH) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const written = [];
async function write(file, pipeline) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const buf = Buffer.isBuffer(pipeline) ? pipeline : await pipeline.toBuffer();
  await fs.writeFile(file, buf);
  const meta = await sharp(buf).metadata().catch(() => null);
  written.push([
    path.relative(ROOT, file),
    meta?.width ? `${meta.width}x${meta.height}` : "",
    `${(buf.length / 1024).toFixed(1)} KB`,
  ]);
}

/** A small transparent copy for pages that load the file directly. */
async function webCopy(name, src, width, { avif = false } = {}) {
  const base = () => sharp(src).resize({ width, kernel: "lanczos3" });
  await write(path.join(BRAND, `${name}.webp`), base().webp({ quality: 82, alphaQuality: 85, effort: 6 }));
  if (avif) await write(path.join(BRAND, `${name}.avif`), base().avif({ quality: 52, effort: 6 }));
}

/**
 * The emblem centred on a dark square, `fill` of the side wide.
 *
 * `radius` rounds the tile and leaves the corners transparent (browser tabs,
 * where the tile is all there is). Without it the tile is full-bleed and
 * opaque, for platforms that cut their own shape (iOS, Android masks) and
 * fill transparent corners with black or white of their own choosing.
 */
async function tile(size, { fill, radius = 0 }) {
  const markW = Math.round(size * fill);
  const mark = await sharp(markFull).resize({ width: markW, kernel: "lanczos3" }).toBuffer();
  const { height: markH } = await sharp(mark).metadata();
  const base = radius
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
          + `<rect width="${size}" height="${size}" rx="${radius * size}" fill="${BG}"/></svg>`,
      )
    : { create: { width: size, height: size, channels: 4, background: BG } };
  return sharp(base)
    .composite([
      {
        input: mark,
        left: Math.round((size - markW) / 2),
        top: Math.round((size - markH) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * A .ico of PNG frames. sharp cannot write ICO; the container is a 6-byte
 * header, one 16-byte entry per frame, then the PNGs themselves — every
 * browser since IE9 reads PNG frames.
 */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = header.length + dir.length;
  frames.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.buf)]);
}

// Full resolution. What next/image is pointed at (it resizes and re-encodes
// per device, so the source weight never reaches a browser), and the input of
// make-watermark-stamp.py and of the photo backfill.
await write(path.join(BRAND, "mark.png"), markFull);
await write(path.join(BRAND, "lockup.png"), lockupFull);
// The bars show it 32-36px tall; 240px covers that at 3x with room to spare.
await write(path.join(BRAND, "lockup-wide.png"), await wideLockup(240));
// Direct-load copies. The splash and the offline page use <picture>/<img>, not
// next/image, and show the lockup ~200px wide; the watermark draws the plain
// mark at most 300px wide. 480px covers both at 2.5x. The brushed metal
// texture is what costs bytes here, not the size.
await webCopy("lockup", lockupFull, 480, { avif: true });
await webCopy("mark", markFull, 480);

// Social preview — Facebook, WhatsApp and X all crop to ~1.91:1. JPEG: the
// PNG is ~300 KB, the size at which WhatsApp starts dropping previews.
{
  const lockupH = 420;
  const lockup = await sharp(lockupFull).resize({ height: lockupH, kernel: "lanczos3" }).toBuffer();
  const { width: lockupW } = await sharp(lockup).metadata();
  await write(
    path.join(BRAND, "og.jpg"),
    sharp({ create: { width: 1200, height: 630, channels: 3, background: BG } })
      .composite([{ input: lockup, left: Math.round((1200 - lockupW) / 2), top: Math.round((630 - lockupH) / 2) }])
      .jpeg({ quality: 88, mozjpeg: true }),
  );
}

// PWA manifest icons. Maskable keeps the emblem inside the 80% safe circle.
await write(path.join(BRAND, "icon-192.png"), await tile(192, { fill: 0.8 }));
await write(path.join(BRAND, "icon-512.png"), await tile(512, { fill: 0.8 }));
await write(path.join(BRAND, "icon-maskable-512.png"), await tile(512, { fill: 0.68 }));

// Next.js file-based metadata (src/app/icon.png, apple-icon.png, favicon.ico).
await write(path.join(APP, "icon.png"), await tile(512, { fill: 0.84, radius: 0.22 }));
await write(path.join(APP, "apple-icon.png"), await tile(180, { fill: 0.78 }));
{
  // Tab icons are tiny: the emblem gets nearly the whole width.
  const frames = [];
  for (const size of [16, 32, 48]) {
    frames.push({ size, buf: await tile(size, { fill: 0.94, radius: 0.18 }) });
  }
  await write(path.join(APP, "favicon.ico"), ico(frames));
}

console.log(`source ${W}x${H}, emblem/wordmark split at row ${split}`);
console.log(`mark box ${JSON.stringify(MARK_BOX)}, lockup box ${JSON.stringify(LOCKUP_BOX)}`);
for (const [file, dims, size] of written) console.log(`  ${file.padEnd(36)} ${dims.padEnd(10)} ${size}`);
