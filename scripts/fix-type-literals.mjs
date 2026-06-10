// Swap the 8 real-estate property-type literals -> car body categories across
// all of src. Safe now: types.ts + label maps use car keys (no quoted
// "apartment" remains except in property-type arrays/validators).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const ROOT = join(process.cwd(), "src");
const EXT = new Set([".ts", ".tsx"]);
const PAIRS = [
  ['"apartment"', '"sedan"'], ['"house"', '"suv"'], ['"villa"', '"hatchback"'],
  ['"land"', '"pickup"'], ['"commercial"', '"van"'], ['"office"', '"coupe"'],
  ['"warehouse"', '"convertible"'], ['"farm"', '"wagon"'],
];
let files = 0, total = 0;
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(p))) continue;
    let src = readFileSync(p, "utf8"), c = 0;
    for (const [a, b] of PAIRS) { const parts = src.split(a); if (parts.length > 1) { c += parts.length - 1; src = parts.join(b); } }
    if (c > 0) { writeFileSync(p, src); files++; total += c; console.log(`  ${p.replace(ROOT, "src")}: ${c}`); }
  }
}
walk(ROOT);
console.log(`\nDONE: ${total} in ${files} files`);
