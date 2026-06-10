// Clean the remaining real-estate "bien(s)" phrases the earlier sweep missed
// (compound noun phrases — safe, specific; avoids the adverb "bien" = "well").
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const ROOT = process.cwd();
const TARGETS = [join(ROOT, "src"), join(ROOT, "messages")];
const EXT = new Set([".ts", ".tsx", ".json"]);
const PAIRS = [
  ["Tous les biens", "Toutes les voitures"],
  ["Vendre un bien", "Vendre une voiture"],
  ["Publier un bien", "Publier une voiture"],
  ["publier un bien", "publier une voiture"],
  ["Enchérir sur les biens", "Enchérir sur les voitures"],
  ["vos biens", "vos voitures"],
  ["les biens", "les voitures"],
  ["ce bien", "ce véhicule"],
];
let files = 0, total = 0;
function processFile(p) {
  if (!EXT.has(extname(p)) || p.includes(".test.")) return;
  let src = readFileSync(p, "utf8"), n = 0;
  for (const [a, b] of PAIRS) { const parts = src.split(a); if (parts.length > 1) { n += parts.length - 1; src = parts.join(b); } }
  if (n > 0) { writeFileSync(p, src); files++; total += n; console.log(`  ${p.replace(ROOT, ".")}: ${n}`); }
}
function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : processFile(p); } }
for (const t of TARGETS) { try { walk(t); } catch (e) { console.log(`skip ${t}: ${e.message}`); } }
console.log(`\nDONE: ${total} in ${files} files`);
