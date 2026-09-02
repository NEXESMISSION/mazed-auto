// ============================================================================
// Put every annonce in a real governorate.
//
//   node scripts/normalize-governorates.mjs            # dry run
//   node scripts/normalize-governorates.mjs --commit
//
// The imported listings carry whatever the source site had in its location
// field, which is often a town or a neighbourhood: "Sahloul", "La Marsa",
// "Cité Ennasr 2", "Boumhel". That is not cosmetic — `/annonces` filters on
// `governorate` against the 24-entry list in src/lib/governorates.ts, so a car
// in Sahloul is INVISIBLE to a buyer filtering on Sousse. Fourteen of the
// sixty-four published annonces were unreachable that way.
//
// Only unambiguous mappings are applied: each town below sits in exactly one
// governorate, which is a geographic fact rather than a guess. Anything the map
// does not cover is reported and left alone — inventing a location for a car
// is a claim about the real world, and a wrong one sends a buyer on a drive.
//
// New listings cannot reintroduce this: both the seller wizard and the admin
// form pick from a <select> of the 24 governorates.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const COMMIT = process.argv.includes("--commit");
const TAG = "[gov]";

const GOVERNORATES = new Set([
  "Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul", "Bizerte", "Zaghouan",
  "Sousse", "Monastir", "Mahdia", "Sfax", "Béja", "Jendouba", "Kef", "Siliana",
  "Kairouan", "Kasserine", "Sidi Bouzid", "Gabès", "Médenine", "Tataouine",
  "Gafsa", "Tozeur", "Kebili",
]);

/** Town / neighbourhood → the governorate it belongs to. */
const TOWN_TO_GOVERNORATE = {
  // Grand Tunis
  "la marsa": "Tunis",
  "el omrane superieur": "Tunis",
  "el omrane supérieur": "Tunis",
  "le bardo": "Tunis",
  "carthage": "Tunis",
  "sidi bou said": "Tunis",
  "cite ennasr": "Ariana",
  "cite ennasr 2": "Ariana",
  "cité ennasr 2": "Ariana",
  "ennasr": "Ariana",
  "mnihla": "Ariana",
  "raoued": "Ariana",
  "soukra": "Ariana",
  "la soukra": "Ariana",
  "ezzahra": "Ben Arous",
  "hammam lif": "Ben Arous",
  "hammam chott": "Ben Arous",
  "borj cedria": "Ben Arous",
  "boumhel": "Ben Arous",
  "boumhel el bassatine": "Ben Arous",
  "mornag": "Ben Arous",
  "rades": "Ben Arous",
  "radès": "Ben Arous",
  "megrine": "Ben Arous",
  "mégrine": "Ben Arous",
  "fouchana": "Ben Arous",
  "douar hicher": "Manouba",
  "oued ellil": "Manouba",
  // Cap Bon
  "hammamet": "Nabeul",
  "korba": "Nabeul",
  "kelibia": "Nabeul",
  "menzel temime": "Nabeul",
  // Sahel
  "sahloul": "Sousse",
  "hammam sousse": "Sousse",
  "msaken": "Sousse",
  "kalaa kebira": "Sousse",
  "sahline": "Monastir",
  "ksar hellal": "Monastir",
  "moknine": "Monastir",
  "jemmal": "Monastir",
  "ouled chamekh": "Mahdia",
  "chebba": "Mahdia",
  "sakiet ezzit": "Sfax",
  "sakiet eddaier": "Sfax",
  // Nord
  "menzel bourguiba": "Bizerte",
  "menzel jemil": "Bizerte",
  "ras jebel": "Bizerte",
};

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const sb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: rows, error } = await sb
  .from("listings")
  .select("id, title, governorate")
  .not("governorate", "is", null);

if (error) {
  console.error(`${TAG} read failed:`, error.message);
  process.exit(1);
}

const fixes = [];
const unknown = new Map();

for (const l of rows ?? []) {
  const g = (l.governorate ?? "").trim();
  if (GOVERNORATES.has(g)) continue;
  const mapped = TOWN_TO_GOVERNORATE[norm(g)];
  if (mapped) fixes.push({ id: l.id, title: l.title, from: g, to: mapped });
  else unknown.set(g, (unknown.get(g) ?? 0) + 1);
}

console.log(`${TAG} listings          : ${rows?.length ?? 0}`);
console.log(`${TAG} already correct   : ${(rows?.length ?? 0) - fixes.length - [...unknown.values()].reduce((a, b) => a + b, 0)}`);
console.log(`${TAG} will be corrected : ${fixes.length}`);
for (const f of fixes) console.log(`    ${f.from}  →  ${f.to}      (${f.title})`);

if (unknown.size) {
  console.log(`\n${TAG} LEFT ALONE — no unambiguous governorate for these:`);
  for (const [g, n] of unknown) console.log(`    "${g}" × ${n}`);
  console.log(`${TAG} Set them by hand in /admin/annonces, or add them to the map above.`);
}

if (!COMMIT) {
  console.log(`\n${TAG} Dry run — nothing written. Re-run with --commit.`);
  process.exit(0);
}

let ok = 0;
for (const f of fixes) {
  const { error: e } = await sb.from("listings").update({ governorate: f.to }).eq("id", f.id);
  if (e) console.error(`${TAG} ${f.title}:`, e.message);
  else ok++;
}
console.log(`\n${TAG} corrected ${ok}/${fixes.length}.`);
