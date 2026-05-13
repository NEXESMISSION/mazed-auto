// Reseed used-car auctions for a chosen seller.
// SAFETY: same project-ref gate as the other scripts.
//
// Run:
//   node scripts/seed-used-auctions.mjs                       (default seller)
//   node scripts/seed-used-auctions.mjs --email=foo@bar.com   (any seller)
//   node scripts/seed-used-auctions.mjs --count=12            (custom row count)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WEB_DIR = resolve(__dirname, "..");
const MAZED_AUTO_PROJECT_REF = "erosazbplfhelvxweeyz";

function fail(msg) {
  console.error("\n❌  " + msg + "\n");
  process.exit(1);
}

function loadEnvLocal() {
  const raw = readFileSync(resolve(REPO_WEB_DIR, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    }),
);

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (projectRef !== MAZED_AUTO_PROJECT_REF) fail(`Project ref mismatch: ${projectRef}`);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Catalogue of used cars ─────────────────────────────────────────
// Every make matches a brand we have a logo for, so the home brand
// rail and Classique view light up with real counts. All conditions
// are "excellent" / "good" / "fair" — zero new cars.
const CATALOG = [
  // make,        model,       year, km,    fuel,       gearbox,     color,     condition,   category,    starting
  ["Renault",     "Clio",      2019, 78000,  "gasoline", "manual",    "Blanc",   "good",      "hatchback", 22000],
  ["Renault",     "Megane",    2018, 92000,  "diesel",   "manual",    "Bleu",    "good",      "berline",   25000],
  ["Renault",     "Captur",    2020, 56000,  "diesel",   "automatic", "Gris",    "excellent", "suv",       34000],
  ["Peugeot",     "208",       2019, 71000,  "diesel",   "manual",    "Gris",    "good",      "hatchback", 24000],
  ["Peugeot",     "3008",      2020, 49000,  "diesel",   "automatic", "Blanc",   "excellent", "suv",       58000],
  ["Peugeot",     "508",       2017, 128000, "diesel",   "automatic", "Noir",    "good",      "berline",   33000],
  ["Volkswagen",  "Golf",      2018, 95000,  "diesel",   "manual",    "Noir",    "good",      "hatchback", 32000],
  ["Volkswagen",  "Polo",      2020, 41000,  "gasoline", "manual",    "Blanc",   "excellent", "hatchback", 28000],
  ["Volkswagen",  "Tiguan",    2019, 67000,  "diesel",   "automatic", "Argent",  "excellent", "suv",       72000],
  ["Toyota",      "Corolla",   2019, 64000,  "hybrid",   "automatic", "Argent",  "excellent", "berline",   46000],
  ["Toyota",      "Yaris",     2020, 38000,  "hybrid",   "automatic", "Bleu",    "excellent", "hatchback", 36000],
  ["Toyota",      "RAV4",      2018, 109000, "hybrid",   "automatic", "Gris",    "good",      "suv",       72000],
  ["Hyundai",     "Tucson",    2019, 73000,  "diesel",   "automatic", "Bleu",    "good",      "suv",       58000],
  ["Hyundai",     "i20",       2020, 44000,  "gasoline", "manual",    "Rouge",   "excellent", "hatchback", 27000],
  ["BMW",         "Série 3",   2017, 118000, "diesel",   "automatic", "Blanc",   "good",      "berline",   55000],
  ["BMW",         "X1",        2019, 82000,  "diesel",   "automatic", "Noir",    "excellent", "suv",       82000],
  ["Mercedes",    "Classe A",  2020, 47000,  "gasoline", "automatic", "Rouge",   "excellent", "hatchback", 78000],
  ["Mercedes",    "Classe C",  2018, 96000,  "diesel",   "automatic", "Gris",    "good",      "berline",   95000],
  ["Kia",         "Sportage",  2019, 71000,  "diesel",   "automatic", "Blanc",   "excellent", "suv",       49000],
  ["Kia",         "Picanto",   2021, 25000,  "gasoline", "manual",    "Jaune",   "excellent", "hatchback", 24000],
  ["Fiat",        "500",       2019, 40000,  "gasoline", "manual",    "Jaune",   "good",      "hatchback", 18000],
  ["Fiat",        "Tipo",      2020, 53000,  "diesel",   "manual",    "Gris",    "good",      "berline",   28000],
  ["Ford",        "Fiesta",    2018, 89000,  "gasoline", "manual",    "Rouge",   "fair",      "hatchback", 19000],
  ["Ford",        "Kuga",      2019, 76000,  "diesel",   "automatic", "Noir",    "good",      "suv",       54000],
  ["Skoda",       "Octavia",   2018, 102000, "diesel",   "automatic", "Noir",    "good",      "berline",   36000],
];

// Photos — Unsplash car photos. thumb() rewrites these to sized
// variants on render, so we can list the bare URL here.
const PHOTO_POOL = [
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8",
  "https://images.unsplash.com/photo-1555215695-3004980ad54e",
  "https://images.unsplash.com/photo-1502877338535-766e1452684a",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70",
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888",
  "https://images.unsplash.com/photo-1542362567-b07e54358753",
  "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2",
];

const sellerEmail = args.email ?? "saifelleuchi127@gmail.com";
const targetCount = Math.min(Number(args.count ?? CATALOG.length), CATALOG.length);

console.log("✓  Locked to project ref:", projectRef);
console.log("✓  Seller email          :", sellerEmail);
console.log("✓  Auctions to insert    :", targetCount);

// Resolve seller user id.
const { data: usersList, error: usersErr } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (usersErr) fail("Couldn't list auth.users — " + usersErr.message);
const seller = (usersList?.users ?? []).find((u) => u.email === sellerEmail);
if (!seller) fail(`User ${sellerEmail} not found. Sign up first or pass --email=<existing user>`);
console.log("✓  Seller id             :", seller.id);

// Ensure the sellers row exists + is active + KYC verified for testing.
const { error: sellerUpsertErr } = await supabase.from("sellers").upsert(
  {
    id: seller.id,
    username: (seller.email ?? "").split("@")[0] || "seller",
    display_name: "Saif",
    trust_score: 80,
    trust_level: "trusted",
    verified_kyc: true,
    account_age_months: 12,
    city: "Tunis",
    is_active: true,
  },
  { onConflict: "id" },
);
if (sellerUpsertErr) fail("sellers upsert — " + sellerUpsertErr.message);

const rows = [];
for (let i = 0; i < targetCount; i++) {
  const [make, model, year, mileage, fuel, gearbox, color, condition, category, starting] = CATALOG[i];
  const reserve = Math.round(starting * 1.15);
  const buyNow = Math.round(starting * 1.4);
  const deposit = Math.round(starting * 0.05);
  const increment = Math.max(Math.round((starting * 0.01) / 50) * 50, 100);
  const days = 3 + Math.floor(Math.random() * 8); // 3-10 days
  const start = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const photoCount = 3 + Math.floor(Math.random() * 4); // 3-6 photos
  const images = Array.from({ length: photoCount }, (_, k) =>
    PHOTO_POOL[(i + k) % PHOTO_POOL.length]
  );
  rows.push({
    seller_id: seller.id,
    make, model, year, mileage,
    fuel_type: fuel,
    transmission: gearbox,
    color, condition, category,
    description: `${make} ${model} ${year} en bon état, prête à rouler. Cette annonce est un véhicule d'occasion.`,
    features: ["Climatisation", "ABS", "Airbags", "Direction assistée"],
    city: "Tunis",
    region: "Tunis",
    image_urls: images,
    video_url: null,
    starting_price: starting,
    reserve_price: reserve,
    buy_now_price: buyNow,
    current_price: starting,
    participation_deposit: deposit,
    bid_increment: increment,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    original_end_time: end.toISOString(),
    status: "active",
    reserve_met: false,
    total_bids: 0,
    total_participants: 0,
    is_featured: false,
    is_vip: false,
  });
}

const { error: insertErr, count } = await supabase
  .from("auctions")
  .insert(rows, { count: "exact" });

if (insertErr) fail("insert failed — " + insertErr.message);

console.log(`\n✓  Inserted ${count ?? rows.length} used-car auctions.`);

// Final sanity count.
const { count: total } = await supabase
  .from("auctions")
  .select("id", { count: "exact", head: true });
console.log(`✓  Total auctions in DB  : ${total}`);
process.exit(0);
