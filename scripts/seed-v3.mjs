// ============================================================================
// Seed the v3 catalog — annonces (cars AND spare parts) with fitments, plus a
// worked pricing setup.
//
//   node scripts/seed-v3.mjs              # dry run
//   node scripts/seed-v3.mjs --commit
//   node scripts/seed-v3.mjs --commit --reset   # delete previous seed first
//
// A separate file from scripts/seed.mjs on purpose: that one seeds properties
// and auctions and is deleted with them in Phase 6b. This seeds the model the
// product actually runs on, so a fresh environment has something to look at
// without dragging the auction fixtures along.
//
// It does NOT invent prices for packs or the badge — those ship inactive at 0
// by design (see 0157). It only fills in what a developer needs to click
// through: categories already exist from the migration, so this adds listings.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const RESET = argv.includes("--reset");
const TAG = "[seed-v3]";

const sb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

// Same production guard as scripts/seed.mjs: .env.local points at the live
// database for this project, and demo listings carrying a real seller's phone
// number are not something to create by accident.
if (COMMIT) {
  const { count } = await sb
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "captured");
  if ((count ?? 0) > 0 && !argv.includes("--force")) {
    console.error(
      `${TAG} Refusing: this database has captured payments, so it is live.\n` +
      `  Re-run with --force only if you really mean to add demo annonces to it.`,
    );
    process.exit(1);
  }
}

const CARS = [
  {
    title: "Renault Clio 5 · 2021",
    description: "Première main, carnet d'entretien complet, pneus neufs.",
    price: 62000, condition: "used", governorate: "Tunis",
    attributes: { make: "Renault", model: "Clio 5", year: 2021, fuel: "gasoline",
                  transmission: "manual", mileage: 48000, color: "Gris" },
  },
  {
    title: "Volkswagen Golf 7 · 2018",
    description: "Diesel, boîte manuelle, très bon état. Visite technique à jour.",
    price: 78000, condition: "used", governorate: "Sousse",
    attributes: { make: "Volkswagen", model: "Golf 7", year: 2018, fuel: "diesel",
                  transmission: "manual", mileage: 121000, color: "Blanc" },
  },
  {
    title: "Dacia Sandero Stepway · 2022",
    description: "Faible kilométrage, garantie constructeur restante.",
    price: 71500, condition: "used", governorate: "Sfax",
    attributes: { make: "Dacia", model: "Sandero", year: 2022, fuel: "gasoline",
                  transmission: "manual", mileage: 26000, color: "Bleu" },
  },
];

const PARTS = [
  {
    title: "Plaquettes de frein avant · Bosch",
    description: "Jeu complet neuf, sous emballage d'origine.",
    price: 120, condition: "new", governorate: "Tunis", category: "freinage",
    attributes: { brand: "Bosch", reference: "0986494600", warranty_months: 12, quantity: 4 },
    fitments: [
      { make: "Renault", model: "Clio 5", year_from: 2019, year_to: 2024 },
      { make: "Renault", model: "Captur", year_from: 2020, year_to: 2024 },
      { make: "Dacia", model: "Sandero", year_from: 2021, year_to: 2024 },
    ],
  },
  {
    title: "Alternateur Valeo · reconditionné",
    description: "Reconditionné en atelier, testé sur banc. Garantie 6 mois.",
    price: 340, condition: "refurbished", governorate: "Ben Arous", category: "electricite",
    attributes: { brand: "Valeo", reference: "TG12C067", warranty_months: 6, quantity: 1 },
    fitments: [
      { make: "Volkswagen", model: "Golf 7", year_from: 2013, year_to: 2020 },
      { make: "Seat", model: "Leon", year_from: 2013, year_to: 2020 },
    ],
  },
  {
    title: "Jeu de 4 pneus 195/65 R15",
    description: "Occasion, environ 70% de gomme restante. Vendus par 4.",
    price: 280, condition: "used", governorate: "Nabeul", category: "pneus-jantes",
    attributes: { brand: "Michelin", quantity: 4 },
    fitments: [{ make: "Renault", model: "Clio 5", year_from: 2019, year_to: null }],
  },
];

const { data: seller } = await sb
  .from("profiles")
  .select("id, full_name, phone")
  .not("phone", "is", null)
  .limit(1)
  .maybeSingle();

if (!seller) {
  console.error(`${TAG} No profile with a phone number — a listing cannot be published without one.`);
  process.exit(1);
}

const { data: cats } = await sb.from("categories").select("id, slug");
const catId = (slug) => cats?.find((c) => c.slug === slug)?.id;
if (!catId("voitures")) {
  console.error(`${TAG} Categories are missing — apply migration 0153 first.`);
  process.exit(1);
}

const { data: photoPool } = await sb.from("property_photos").select("storage_path").limit(24);
const photos = (photoPool ?? []).map((p) => p.storage_path);

console.log(`${TAG} seller  : ${seller.full_name ?? seller.id} (${seller.phone})`);
console.log(`${TAG} listings: ${CARS.length} voitures + ${PARTS.length} pièces`);
console.log(`${TAG} photos  : reusing ${photos.length} existing objects (nothing uploaded)`);

if (!COMMIT) {
  console.log(`\n${TAG} Dry run — nothing written. Re-run with --commit.`);
  process.exit(0);
}

if (RESET) {
  const titles = [...CARS, ...PARTS].map((x) => x.title);
  const { error } = await sb.from("listings").delete().in("title", titles);
  if (error) console.warn(`${TAG} reset:`, error.message);
  else console.log(`${TAG} previous seed removed`);
}

async function insert(item, categorySlug) {
  const { data: row, error } = await sb
    .from("listings")
    .insert({
      seller_id: seller.id,
      category_id: catId(categorySlug),
      title: item.title,
      description: item.description,
      price: item.price,
      negotiable: true,
      condition: item.condition,
      governorate: item.governorate,
      attributes: item.attributes,
      contact_name: seller.full_name,
      contact_phone: seller.phone,
      contact_whatsapp: seller.phone,
      show_phone: true,
      seller_attestation_version: "v1",
      status: "published",
      published_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    })
    .select("id")
    .single();
  if (error) { console.error(`${TAG} ${item.title}:`, error.message); return null; }

  const pick = photos.slice(0, 4).map((p, i) => ({ listing_id: row.id, storage_path: p, sort_order: i }));
  if (pick.length) await sb.from("listing_photos").insert(pick);
  photos.push(...photos.splice(0, 4)); // rotate so listings differ

  if (item.fitments?.length) {
    await sb.from("listing_fitments").insert(
      item.fitments.map((f) => ({ listing_id: row.id, ...f })),
    );
  }
  console.log(`  ✓ ${item.title}`);
  return row.id;
}

for (const car of CARS) await insert(car, "voitures");
for (const part of PARTS) await insert(part, part.category);

console.log(`\n${TAG} Done. Browse /fr/annonces — try "compatible avec Renault Clio 5 2021".`);
