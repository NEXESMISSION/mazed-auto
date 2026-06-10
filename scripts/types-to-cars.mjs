// One-shot: swap the real-estate property-type lists/defaults to car body
// categories wherever they appear identically (admin catalogs, explore/legal
// API validators, sell form). Label maps + the home tiles are edited by hand.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const ROOT = join(process.cwd(), "src");
const EXT = new Set([".ts", ".tsx"]);
const PAIRS = [
  [`  "apartment", "house", "villa", "land",\n  "commercial", "office", "warehouse", "farm",`,
   `  "sedan", "suv", "hatchback", "pickup",\n  "van", "coupe", "convertible", "wagon",`],
  [`["apartment", "house", "villa", "land", "commercial", "office", "warehouse", "farm"]`,
   `["sedan", "suv", "hatchback", "pickup", "van", "coupe", "convertible", "wagon"]`],
  [`useState<PropertyType>("apartment")`, `useState<PropertyType>("sedan")`],
  [`?? "apartment"`, `?? "sedan"`],
];
let files = 0, total = 0;
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(p))) continue;
    let src = readFileSync(p, "utf8"), c = 0;
    for (const [a, b] of PAIRS) {
      const parts = src.split(a);
      if (parts.length > 1) { c += parts.length - 1; src = parts.join(b); }
    }
    if (c > 0) { writeFileSync(p, src); files++; total += c; console.log(`  ${p.replace(ROOT, "src")}: ${c}`); }
  }
}
walk(ROOT);
console.log(`\nDONE: ${total} in ${files} files`);
