// One-shot: convert /public/logo.png (~137 KB) into /public/logo.webp
// for use in UI <img> tags. The original PNG stays because the PWA
// manifest requires PNG for Android home-screen icons.
//
// Run with: node scripts/optimize-logo.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "public");

async function go() {
  const src = resolve(PUBLIC_DIR, "logo.png");
  const dst = resolve(PUBLIC_DIR, "logo.webp");
  if (!existsSync(src)) {
    console.error(`source missing: ${src}`);
    process.exit(1);
  }
  const before = readFileSync(src).length;
  // quality 86 keeps the gold/black gradient sharp; lower than that
  // starts visibly banding the gradient stops. Effort 6 is the
  // sharp-recommended sweet spot (slower encode, smaller file).
  const buf = await sharp(src).webp({ quality: 86, effort: 6 }).toBuffer();
  writeFileSync(dst, buf);
  const after = buf.length;
  const saved = Math.round((1 - after / before) * 100);
  console.log(`logo.png  ${before.toLocaleString()} B`);
  console.log(`logo.webp ${after.toLocaleString()} B  (-${saved}%)`);
}

go().catch((err) => {
  console.error(err);
  process.exit(1);
});
