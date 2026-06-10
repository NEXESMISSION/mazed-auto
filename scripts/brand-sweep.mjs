// One-shot: rebrand Batta -> Mazed Auto and real-estate wording -> car, across
// src/ and messages/fr.json. Ordered specific->generic. Excludes *.test.* and the
// legal entity name in payments. Leaves DB table names / code identifiers alone
// (they don't contain these French phrases).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
const TARGETS = [join(ROOT, "src"), join(ROOT, "messages")];
const EXT = new Set([".tsx", ".ts", ".jsx", ".js", ".json"]);
const SKIP = (p) => p.includes(".test.") || basename(p) === "payments" /* dir */;

const RULES = [
  // Brand
  [/Batta\.tn/g, "Mazed Auto"],
  [/batta\.tn/g, "mazed.tn"],
  [/\bBatta\b/g, "Mazed Auto"],
  // Real-estate phrases (specific BEFORE generic stems)
  [/Agences immobilières/g, "Concessionnaires"],
  [/agences immobilières/g, "concessionnaires"],
  [/agence immobilière/g, "concessionnaire"],
  [/biens immobiliers/g, "voitures"],
  [/bien immobilier/g, "voiture"],
  // immobilier stems
  [/immobilières/g, "automobiles"],
  [/immobilière/g, "automobile"],
  [/immobiliers/g, "automobiles"],
  [/immobilier/g, "automobile"],
  [/Immobilier/g, "Automobile"],
  // known "biens"/"bien" UI phrases (avoid blanket bien-> too ambiguous)
  [/"Biens"/g, '"Voitures"'],
  [/Aucun bien enregistré/g, "Aucune voiture enregistrée"],
  [/Explorer les biens/g, "Explorer les voitures"],
  [/Rechercher un bien/g, "Rechercher une voiture"],
  [/Déposez votre bien/g, "Listez votre voiture"],
  [/déposez votre bien/g, "listez votre voiture"],
  [/Vos biens en vente/g, "Vos voitures en vente"],
  [/Des biens sous le marché/g, "Des voitures sous le prix du marché"],
  [/chaque bien/g, "chaque voiture"],
];

let filesChanged = 0, total = 0;
function processFile(p) {
  if (!EXT.has(extname(p))) return;
  if (p.includes(".test.")) return;
  if (p.endsWith(join("lib", "payments", "index.ts"))) return; // keep legal entity name
  const orig = readFileSync(p, "utf8");
  let out = orig, n = 0;
  for (const [re, rep] of RULES) out = out.replace(re, () => { n++; return rep; });
  if (out !== orig) { writeFileSync(p, out); filesChanged++; total += n; console.log(`  ${p.replace(ROOT, ".")}: ${n}`); }
}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else processFile(p);
  }
}
for (const t of TARGETS) { try { walk(t); } catch (e) { console.log(`skip ${t}: ${e.message}`); } }
console.log(`\nDONE: ${total} replacements across ${filesChanged} files.`);
