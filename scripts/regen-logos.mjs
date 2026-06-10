// Regenerate every logo variant from the real Mazed Auto logo (public/logo.png,
// copied from v1 — gold "MA" monogram on black). The land/Batta logo was still
// showing because only logo.png/webp were replaced; the AVIF + square + lg +
// favicon variants (which the <picture>/metadata prefer) were still the old one.
import sharp from "sharp";
import path from "node:path";
const pub = path.join(process.cwd(), "public");
const SRC = path.join(pub, "logo.png");

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const jobs = [
  sharp(SRC).resize({ width: 512, height: 512, fit: "contain", background: transparent }).webp({ quality: 90 }).toFile(path.join(pub, "logo.webp")),
  sharp(SRC).resize({ width: 512, height: 512, fit: "contain", background: transparent }).avif({ quality: 62 }).toFile(path.join(pub, "logo.avif")),
  sharp(SRC).resize({ width: 1024, height: 1024, fit: "contain", background: transparent }).webp({ quality: 90 }).toFile(path.join(pub, "logo-lg.webp")),
  sharp(SRC).resize({ width: 1024, height: 1024, fit: "contain", background: transparent }).avif({ quality: 62 }).toFile(path.join(pub, "logo-lg.avif")),
  sharp(SRC).resize({ width: 512, height: 512, fit: "cover" }).png().toFile(path.join(pub, "logo-square.png")),
  sharp(SRC).resize({ width: 64, height: 64, fit: "cover" }).png().toFile(path.join(pub, "favicon-64.png")),
];
await Promise.all(jobs);
console.log("regenerated: logo.webp, logo.avif, logo-lg.webp, logo-lg.avif, logo-square.png, favicon-64.png");
