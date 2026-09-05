/**
 * seed-market — fills the catalogue with demo content that looks like the real
 * Tunisian market, using real photographs.
 *
 * WHY IT EXISTS. `scripts/seed-v3.mjs` reuses photo objects already in storage,
 * which is fine for cars but leaves the parts half of the catalogue empty —
 * measured before this ran: 10 part categories, **1 listing between them**. A
 * marketplace you cannot browse is one you cannot judge.
 *
 * WHERE THE PHOTOS COME FROM. Wikimedia Commons, via its search API, filtered
 * to openly-licensed files (CC0 / CC BY / CC BY-SA / public domain). Deliberately
 * NOT scraped from tayara.tn, vidange.tn or any other marketplace: those photos
 * are their sellers' copyright, and "it is only a demo" is not a licence. Each
 * photo's source file and licence is recorded in `listings.attributes.photo_credit`
 * so the provenance travels with the row.
 *
 * WHERE THE DATA COMES FROM. Part names, brands and reference formats follow
 * what Tunisian parts retailers actually list (Bosch, MANN-FILTER, MAHLE, NGK,
 * Valeo, Sachs, LUK, Gates, TRW, Shell Helix). Prices are realistic market
 * estimates, not scraped quotes — they are demo figures and should not be read
 * as anyone's real pricing.
 *
 * Usage:
 *   node scripts/seed-market.mjs            # dry run — says what it would add
 *   node scripts/seed-market.mjs --commit   # actually writes
 *   node scripts/seed-market.mjs --commit --only=parts
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TAG = "[seed-market]";
const COMMIT = process.argv.includes("--commit");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "all";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`${TAG} missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

/* ── Photos ────────────────────────────────────────────────────────────────
   One search per term against Commons, filtered to real photographs. The
   exclusions matter: a search for "brake pad" happily returns a patent
   drawing, a packaging shot and a disassembly diagram, none of which look
   like something a seller photographed.                                     */

/**
 * Files that are technically a match and visually useless.
 *
 * Three groups, each learned from a bad result rather than guessed:
 *   – not a photograph (patent drawings, cutaways, schematics)
 *   – the right word, the wrong object ("roof WITHOUT rack", a radiator GRILLE,
 *     an F1 wheel, a hand water pump on a fire engine)
 *   – the right object, the wrong century: Commons is full of pre-war and
 *     museum pieces, and "Fiat Tipo 6 Torpedo 1912" is not what a buyer
 *     browsing Tipos expects to see.
 */
const REJECT = new RegExp(
  [
    // Not a photograph.
    "disassembl", "cutaway", "diagram", "patent", "drawing", "schematic",
    "animation", "svg", "handbook", "construction methods", "logo", "icon",
    "chart", "graph",
    // Right word, wrong object. Boundaries are written as explicit character
    // classes rather than \b: this list is assembled from STRINGS, and "\b"
    // inside a JS string literal is a backspace character, not a word
    // boundary — the regex silently stops matching and every rejected file
    // comes back.
    "without", "grille", "grill([^a-z]|$)", "wheelbarrow", "torpedo",
    "fire engine", "locomotive", "railroad", "railway", "interurban", "tram",
    "carbon arc", "(^|[^a-z0-9])f1([^a-z0-9]|$)", "formula", "racing", "rally",
    "(^|[^a-z])map([^a-z]|$)", "(^|[^a-z])nara([^a-z]|$)",
    // Right object, wrong century.
    "museum",
    "(^|[^0-9])1[0-8][0-9][0-9]([^0-9]|$)",
    "(^|[^0-9])19[0-7][0-9]([^0-9]|$)",
  ].join("|"),
  "i",
);
const OK_LICENCE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip punctuation and accents so "Photo-CarBattery.jpg" still matches "car". */
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Commons rate-limits anonymous callers hard (HTTP 429 after a handful of
 * rapid queries), so calls are spaced and retried rather than fired in a loop.
 */
let lastCall = 0;

/**
 * One throttled, retrying door to Wikimedia — used for BOTH the search API and
 * the file downloads.
 *
 * Throttling only the API was not enough: `Special:FilePath` rate-limits
 * separately, so a run that searched politely then pulled 75 images as fast as
 * it could still collected a wall of 429s. One shared gate, one queue.
 */
async function polite(url, label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = Math.max(0, 900 - (Date.now() - lastCall)) + attempt * 3000;
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, {
      headers: { "User-Agent": "mazed-auto-seed/1.0 (demo catalogue; contact: admin@mazed.tn)" },
    });
    if (res.ok) return res;
    if (res.status !== 429) throw new Error(`${label} ${res.status}`);
  }
  throw new Error(`${label} 429 after retries`);
}

async function commons(api) {
  return (await polite(api, "commons")).json();
}

/**
 * Search Commons for a real photograph of `term`.
 *
 * `must` is the part that makes this usable. Commons' search widens when it
 * runs out of close matches, so "air filter" cheerfully returns an infrared
 * landscape of Buena Vista, Colorado, and "motor oil" returns a 1931 aviation
 * magazine scan. Requiring every keyword to appear in the FILE NAME throws
 * those out — a photo of the thing is nearly always named after the thing.
 */
async function findPhotos(term, must, want) {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search" +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}` +
    "&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|size|extmetadata" +
    "&iiextmetadatafilter=LicenseShortName|Artist";

  const json = await commons(api);
  const pages = Object.values(json.query?.pages ?? {});

  const picked = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const title = p.title.replace(/^File:/, "");
    const licence = ii.extmetadata?.LicenseShortName?.value ?? "";
    if (!OK_LICENCE.test(licence)) continue;
    if (REJECT.test(title)) continue;
    if ((ii.width ?? 0) < 700) continue;
    const n = norm(title);
    if (!must.every((k) => n.includes(k))) continue;
    picked.push({
      file: title,
      licence,
      author: (ii.extmetadata?.Artist?.value ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 80),
      src: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=1400`,
    });
    if (picked.length >= want) break;
  }
  return picked;
}

/** Download → resize → webp → Supabase storage, returning the bucket path. */
async function upload(photo, sellerId, index) {
  const res = await polite(photo.src, "download");
  const input = Buffer.from(await res.arrayBuffer());

  // Same shape the seller upload pipeline produces: max 1400px, webp q72.
  const out = await sharp(input)
    .rotate()
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const path = `${sellerId}/annonce-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${index}.webp`;
  const { error } = await sb.storage
    .from("properties")
    .upload(path, out, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`upload: ${error.message}`);
  return { path, bytes: out.length };
}

/* ── Catalogue ─────────────────────────────────────────────────────────────
   Parts first: that is the empty half. Every part carries the attributes its
   category actually declares (brand + condition are required), a reference in
   the format the trade uses, and fitments — which vehicles it goes on. Fitment
   is the single most important filter on a parts marketplace and the reason
   `listing_fitments` is a table rather than a jsonb blob.                    */

const PARTS = [
  {
    title: "Plaquettes de frein avant — Bosch",
    cat: "Freinage", price: 95, gov: "Tunis", q: "brake pad", must: ["brake", "pad"],
    desc: "Jeu de 4 plaquettes avant, neuves, montage Clio 4 / Symbol. Référence Bosch d'origine, garantie 12 mois. Pose possible sur place.",
    attrs: { brand: "Bosch", reference: "0 986 494 600", condition: "new", warranty_months: 12, quantity: 4 },
    fit: [{ make: "Renault", model: "Clio", year_from: 2012, year_to: 2019, engine: "1.5 dCi" },
          { make: "Renault", model: "Symbol", year_from: 2013, year_to: 2021, engine: "1.5 dCi" }],
  },
  {
    title: "Disques de frein avant ventilés — TRW",
    cat: "Freinage", price: 210, gov: "Sfax", q: "brake disc", must: ["brake", "disc"],
    desc: "Paire de disques ventilés 288 mm, neufs. Golf 6 et 7, Leon, Octavia. Vendus par deux, garantie 12 mois.",
    attrs: { brand: "TRW", reference: "DF4464S", condition: "new", warranty_months: 12, quantity: 2 },
    fit: [{ make: "Volkswagen", model: "Golf", year_from: 2008, year_to: 2020, engine: "1.6 TDI" },
          { make: "Seat", model: "Leon", year_from: 2012, year_to: 2020, engine: "1.6 TDI" }],
  },
  {
    title: "Filtre à huile — MANN-FILTER",
    cat: "Filtration & entretien", price: 28, gov: "Ariana", q: "oil filter", must: ["oil", "filter"],
    desc: "Filtre à huile neuf pour moteurs 1.6 HDi / dCi. Origine constructeur, sous emballage.",
    attrs: { brand: "MANN-FILTER", reference: "W 7015", condition: "new", warranty_months: 6, quantity: 1 },
    fit: [{ make: "Peugeot", model: "208", year_from: 2012, year_to: 2019, engine: "1.6 HDi" },
          { make: "Citroën", model: "C-Elysée", year_from: 2012, year_to: 2020, engine: "1.6 HDi" }],
  },
  // No air filter: Commons has no clean product shot of one. Every candidate
  // is a camera polarizing filter or a Navy fuel-rig photo, and a wrong photo
  // on a demo catalogue is worse than one fewer row.
  {
    title: "Bougies d'allumage NGK — jeu de 4",
    cat: "Filtration & entretien", price: 68, gov: "Tunis", q: "spark plug", must: ["spark", "plug"],
    desc: "Quatre bougies NGK neuves pour moteurs essence 1.2 / 1.4. Sous blister d'origine.",
    attrs: { brand: "NGK", reference: "BKR6E-11", condition: "new", warranty_months: 12, quantity: 4 },
    fit: [{ make: "Volkswagen", model: "Polo", year_from: 2009, year_to: 2017, engine: "1.2 TSI" },
          { make: "Kia", model: "Picanto", year_from: 2011, year_to: 2020, engine: "1.2 essence" }],
  },
  {
    title: "Huile moteur Shell Helix HX7 5W-40 — bidon 5 L",
    cat: "Filtration & entretien", price: 145, gov: "Ben Arous", q: "motor oil bottle", must: ["oil"],
    desc: "Bidon de 5 litres neuf, scellé. Convient essence et diesel, norme ACEA A3/B4. Vidange complète pour la plupart des citadines.",
    attrs: { brand: "Shell", reference: "HX7 5W-40", condition: "new", quantity: 1 },
    fit: [],
  },
  {
    title: "Batterie 12V 60Ah 540A — Assad",
    cat: "Électricité & batterie", price: 320, gov: "Tunis", q: "car battery", must: ["battery"],
    desc: "Batterie neuve 60Ah, fabrication tunisienne, garantie 18 mois. Reprise de l'ancienne batterie possible.",
    attrs: { brand: "Assad", reference: "L2 60Ah", condition: "new", warranty_months: 18, quantity: 1 },
    fit: [{ make: "Renault", model: "Clio", year_from: 2005, year_to: 2024, engine: "" },
          { make: "Peugeot", model: "208", year_from: 2012, year_to: 2024, engine: "" }],
  },
  {
    title: "Alternateur Valeo 90A — reconditionné",
    cat: "Électricité & batterie", price: 480, gov: "Sfax", q: "alternator", must: ["alternator"],
    desc: "Alternateur reconditionné en atelier, testé sur banc. Kangoo et Clio 1.5 dCi. Garantie 6 mois pièce.",
    attrs: { brand: "Valeo", reference: "TG9B040", condition: "refurbished", warranty_months: 6, quantity: 1 },
    fit: [{ make: "Renault", model: "Kangoo", year_from: 2008, year_to: 2019, engine: "1.5 dCi" },
          { make: "Renault", model: "Clio", year_from: 2005, year_to: 2016, engine: "1.5 dCi" }],
  },
  {
    title: "Amortisseurs avant Sachs — la paire",
    cat: "Suspension & direction", price: 390, gov: "Monastir", q: "shock absorber car", must: ["shock", "absorber"],
    desc: "Deux amortisseurs avant neufs, gaz. Golf 5 et 6. Vendus par paire, pose recommandée par essieu complet.",
    attrs: { brand: "Sachs", reference: "315 355", condition: "new", warranty_months: 12, quantity: 2 },
    fit: [{ make: "Volkswagen", model: "Golf", year_from: 2003, year_to: 2013, engine: "1.9 TDI" }],
  },
  {
    title: "Kit d'embrayage LUK — 3 pièces",
    cat: "Boîte & transmission", price: 620, gov: "Nabeul", q: "clutch disc", must: ["clutch"],
    desc: "Kit complet neuf : disque, mécanisme et butée. Clio 3 et Modus 1.5 dCi. Garantie 12 mois.",
    attrs: { brand: "LUK", reference: "622 3082 00", condition: "new", warranty_months: 12, quantity: 1 },
    fit: [{ make: "Renault", model: "Clio", year_from: 2005, year_to: 2014, engine: "1.5 dCi" }],
  },
  {
    title: "Kit de distribution Gates — courroie + galets",
    cat: "Moteur", price: 340, gov: "Tunis", q: "timing belt", must: ["timing", "belt"],
    desc: "Kit de distribution neuf, courroie et galets tendeurs. 1.6 HDi 92 ch. À remplacer tous les 120 000 km.",
    attrs: { brand: "Gates", reference: "K015623XS", condition: "new", warranty_months: 12, quantity: 1 },
    fit: [{ make: "Peugeot", model: "208", year_from: 2012, year_to: 2019, engine: "1.6 HDi" },
          { make: "Peugeot", model: "Partner", year_from: 2010, year_to: 2018, engine: "1.6 HDi" }],
  },
  {
    title: "Pompe à eau — Hepu",
    cat: "Moteur", price: 185, gov: "Bizerte", q: "water pump car engine", must: ["water", "pump"],
    desc: "Pompe à eau neuve avec joint. Golf 5 1.9 TDI et dérivés. À monter avec le kit de distribution.",
    attrs: { brand: "Hepu", reference: "P546", condition: "new", warranty_months: 12, quantity: 1 },
    fit: [{ make: "Volkswagen", model: "Golf", year_from: 2003, year_to: 2010, engine: "1.9 TDI" }],
  },
  {
    title: "Radiateur d'eau — Symbol 1.5 dCi",
    cat: "Moteur", price: 295, gov: "Kairouan", q: "car radiator cooling engine", must: ["radiator"],
    desc: "Radiateur de refroidissement neuf, aluminium. Symbol et Clio 1.5 dCi sans climatisation.",
    attrs: { brand: "Nissens", reference: "637623", condition: "new", warranty_months: 12, quantity: 1 },
    fit: [{ make: "Renault", model: "Symbol", year_from: 2008, year_to: 2019, engine: "1.5 dCi" }],
  },
  {
    title: "Phare avant droit — Clio 4",
    cat: "Carrosserie & optique", price: 260, gov: "Sousse", q: "car headlight", must: ["headlight"],
    desc: "Optique avant droit d'occasion, en très bon état, vitre sans rayure. Clio 4 phase 1 (2013-2016).",
    attrs: { brand: "Valeo", reference: "260109348R", condition: "used", quantity: 1 },
    fit: [{ make: "Renault", model: "Clio", year_from: 2013, year_to: 2016, engine: "" }],
  },
  {
    title: "Pneus Michelin Energy 195/65 R15 — jeu de 4",
    cat: "Pneus & jantes", price: 640, gov: "Ariana", q: "car tire", must: ["tire"],
    desc: "Quatre pneus neufs 195/65 R15 91H. Montage et équilibrage inclus sur place.",
    attrs: { brand: "Michelin", reference: "195/65 R15 91H", condition: "new", warranty_months: 24, quantity: 4 },
    fit: [],
  },
  {
    title: "Jantes alliage 16 pouces — jeu de 4",
    cat: "Pneus & jantes", price: 750, gov: "Tunis", q: "alloy wheel car", must: ["alloy", "wheel"],
    desc: "Quatre jantes alliage 16\", entraxe 4x100, en bon état. Légères marques d'usage sur une jante.",
    attrs: { brand: "Ronal", reference: "16\" 4x100 ET40", condition: "used", quantity: 4 },
    fit: [],
  },
  {
    title: "Tapis de sol caoutchouc — jeu complet",
    cat: "Intérieur", price: 90, gov: "Ben Arous", q: "car floor mat", must: ["mat"],
    desc: "Jeu de quatre tapis caoutchouc sur mesure, neufs. Rebords hauts, lavables.",
    attrs: { brand: "Petex", reference: "TPE-4P", condition: "new", quantity: 4 },
    fit: [{ make: "Toyota", model: "Hilux", year_from: 2016, year_to: 2024, engine: "" }],
  },
  {
    title: "Barres de toit transversales — universelles",
    cat: "Accessoires", price: 180, gov: "Nabeul", q: "roof rack car", must: ["roof", "rack"],
    desc: "Paire de barres de toit en aluminium, fixation sur rails. Charge maximale 75 kg, antivol fourni.",
    attrs: { brand: "Thule", reference: "SquareBar 118", condition: "new", warranty_months: 12, quantity: 2 },
    fit: [],
  },
];

/* Vehicles — the two empty categories (Camions, Motos) and a few of the cars
   that actually move in Tunisia. */
const VEHICLES = [
  {
    title: "Isuzu NPR 2016 — 3,5 T",
    cat: "Camions", price: 78000, gov: "Sfax", q: "Isuzu truck", must: ["isuzu"],
    desc: "Camion plateau 3,5 tonnes, moteur 3.0 diesel, 210 000 km. Entretien suivi, pneus récents, visite technique à jour.",
    attrs: { annee: 2016, kilometrage: 210000, carburant: "diesel", boite: "manuelle" },
  },
  {
    title: "Mercedes-Benz Actros 2014 — tracteur routier",
    cat: "Camions", price: 195000, gov: "Ben Arous", q: "Mercedes Actros truck", must: ["actros"],
    desc: "Tracteur routier 440 ch, 620 000 km. Boîte automatisée, cabine grand volume. Papiers en règle, prêt à travailler.",
    attrs: { annee: 2014, kilometrage: 620000, carburant: "diesel", boite: "automatique" },
  },
  {
    title: "Yamaha NMAX 155 — 2022",
    cat: "Motos", price: 14500, gov: "Tunis", q: "Yamaha NMAX scooter", must: ["nmax"],
    desc: "Scooter 155 cm³, 12 000 km, première main. ABS, démarrage sans clé. Entretien fait chez l'agent.",
    attrs: { annee: 2022, kilometrage: 12000, carburant: "essence", boite: "automatique" },
  },
  {
    title: "SYM Symphony 125 — 2021",
    cat: "Motos", price: 6900, gov: "Sousse", q: "motor scooter 125", must: ["scooter"],
    desc: "Scooter 125 cm³ en très bon état, 18 500 km. Idéal ville, faible consommation. Casque offert.",
    attrs: { annee: 2021, kilometrage: 18500, carburant: "essence", boite: "automatique" },
  },
  {
    title: "Peugeot Partner 2019 — utilitaire tôlé",
    cat: "Utilitaires", price: 54000, gov: "Ariana", q: "Peugeot Partner van", must: ["partner"],
    desc: "Fourgon tôlé 1.6 BlueHDi, 96 000 km. Cloison de séparation, deux portes latérales. Carnet d'entretien complet.",
    attrs: { annee: 2019, kilometrage: 96000, carburant: "diesel", boite: "manuelle" },
  },
  {
    title: "Renault Kangoo 2020 — Express",
    cat: "Utilitaires", price: 49500, gov: "Monastir", q: "Renault Kangoo van", must: ["kangoo"],
    desc: "Kangoo Express 1.5 dCi, 78 000 km, climatisation. Utilisé pour livraison en ville, très bien entretenu.",
    attrs: { annee: 2020, kilometrage: 78000, carburant: "diesel", boite: "manuelle" },
  },
  {
    title: "Kia Picanto 2021",
    cat: "Voitures", price: 42000, gov: "Tunis", q: "Kia Picanto", must: ["picanto"],
    desc: "Citadine 1.0 essence, 34 000 km, première main. Climatisation, écran tactile, caméra de recul.",
    attrs: { annee: 2021, kilometrage: 34000, carburant: "essence", boite: "manuelle" },
  },
  {
    title: "Fiat Tipo 2019",
    cat: "Voitures", price: 47500, gov: "Sfax", q: "Fiat Tipo 2016", must: ["fiat", "tipo"],
    desc: "Berline 1.4 essence, 71 000 km. Bien entretenue, pneus neufs, visite technique passée en juin.",
    attrs: { annee: 2019, kilometrage: 71000, carburant: "essence", boite: "manuelle" },
  },
];

/* ── Run ───────────────────────────────────────────────────────────────── */

const [{ data: cats }, { data: sellers }, { data: existing }] = await Promise.all([
  sb.from("categories").select("id, label_fr, kind").not("parent_id", "is", null),
  sb.from("profiles").select("id, full_name, phone").in("role", ["agency", "individual"]).not("phone", "is", null),
  sb.from("listings").select("title"),
]);

const catId = (label) => cats?.find((c) => c.label_fr === label)?.id;
const have = new Set((existing ?? []).map((l) => l.title));
const pool = (sellers ?? []).filter((s) => s.phone);
if (pool.length === 0) {
  console.error(`${TAG} no seller with a phone number — a listing cannot be published without one`);
  process.exit(1);
}

const items = [
  ...(ONLY === "vehicles" ? [] : PARTS),
  ...(ONLY === "parts" ? [] : VEHICLES),
];

console.log(`${TAG} ${COMMIT ? "COMMIT" : "DRY RUN"} · ${items.length} candidates · ${pool.length} sellers`);

let added = 0, skipped = 0, failed = 0, bytes = 0;

for (const [i, item] of items.entries()) {
  if (have.has(item.title)) { console.log(`  – ${item.title} (exists)`); skipped++; continue; }
  const category = catId(item.cat);
  if (!category) { console.error(`  ✗ ${item.title}: unknown category "${item.cat}"`); failed++; continue; }

  const seller = pool[i % pool.length];

  try {
    const found = await findPhotos(item.q, item.must, 3);
    if (found.length === 0) { console.error(`  ✗ ${item.title}: no usable photo for "${item.q}"`); failed++; continue; }

    if (!COMMIT) {
      console.log(`  + ${item.title}  [${item.cat}]  ${item.price} TND  ${found.length} photo(s)`);
      found.forEach((f) => console.log(`      ${f.file} — ${f.licence}`));
      added++;
      continue;
    }

    const uploaded = [];
    for (const [n, photo] of found.entries()) {
      const { path, bytes: b } = await upload(photo, seller.id, n);
      uploaded.push(path);
      bytes += b;
    }

    const isPart = cats.find((c) => c.id === category)?.kind === "part";
    const { data: row, error } = await sb
      .from("listings")
      .insert({
        seller_id: seller.id,
        category_id: category,
        title: item.title,
        description: item.desc,
        price: item.price,
        negotiable: true,
        condition: item.attrs.condition ?? (isPart ? "new" : "used"),
        governorate: item.gov,
        attributes: {
          ...item.attrs,
          // Provenance travels with the row: whoever sees this photo can find
          // the file it came from and the licence it came under.
          photo_credit: found.map((f) => `${f.file} — ${f.licence}${f.author ? ` — ${f.author}` : ""}`),
        },
        contact_name: seller.full_name,
        contact_phone: seller.phone,
        contact_whatsapp: seller.phone,
        show_phone: true,
        // "v1-demo", never "v1": v1 means a seller personally ticked the sworn
        // accuracy statement. Nobody did. Writing v1 would be a false record of
        // exactly the thing the attestation exists to prove.
        seller_attestation_version: "v1-demo",
        status: "published",
        published_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await sb.from("listing_photos").insert(
      uploaded.map((p, n) => ({ listing_id: row.id, storage_path: p, sort_order: n, is_cover: n === 0 })),
    );
    if (item.fit?.length) {
      await sb.from("listing_fitments").insert(item.fit.map((f) => ({ listing_id: row.id, ...f })));
    }

    console.log(`  ✓ ${item.title}  [${item.cat}]  ${item.price} TND  ${uploaded.length} photo(s)`);
    added++;
  } catch (e) {
    console.error(`  ✗ ${item.title}: ${e.message}`);
    failed++;
  }
}

console.log(
  `\n${TAG} ${COMMIT ? "added" : "would add"} ${added} · skipped ${skipped} · failed ${failed}` +
    (COMMIT ? ` · ${(bytes / 1024 / 1024).toFixed(1)} MB uploaded` : ""),
);
if (!COMMIT) console.log(`${TAG} re-run with --commit to write.`);
