// ============================================================================
// Mazed Auto — demo CAR listings seeder (idempotent).
//
// Mirrors scripts/seed.mjs machinery but for vehicles. Uses the service-role
// key to bypass RLS so it can write across tables. All demo users share the
// password below, so you can log in as any of them.
//
// Usage:  node scripts/seed-cars.mjs   (run from the project root)
//
// Photos: none yet — cards render the car-icon placeholder. Real photos come
// from the importer step. The `properties` table is reused as the vehicle
// table; car specs live in `properties.attributes` (jsonb).
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SVC) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(SB_URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = "Mazed!2026";

async function ensureUser({ email, fullName, phone, role, governorate }) {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 });
  let id = list?.users.find((u) => u.email === email)?.id;
  if (!id) {
    const { data, error } = await sb.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: fullName, phone, role },
      app_metadata: role === "admin" ? { role: "admin" } : undefined,
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    id = data.user.id;
  }
  await sb.from("profiles").update({
    full_name: fullName, phone, role, governorate,
    kyc_status: "verified", kyc_verified_at: new Date().toISOString(), trust_score: 80,
  }).eq("id", id);
  return id;
}

const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const daysFromNow = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

console.log("→ Creating demo users…");
const admin = await ensureUser({ email: "admin@mazed.tn", fullName: "Admin Mazed",   phone: "+216 71 000 001", role: "admin",      governorate: "Tunis" });
const karim = await ensureUser({ email: "karim@mazed.tn", fullName: "Karim Bouazizi", phone: "+216 22 111 222", role: "individual", governorate: "Tunis" });
const sami  = await ensureUser({ email: "sami@mazed.tn",  fullName: "Sami Trabelsi",  phone: "+216 50 333 444", role: "individual", governorate: "Sousse" });
const leila = await ensureUser({ email: "leila@mazed.tn", fullName: "Leila Mhiri",    phone: "+216 95 555 666", role: "individual", governorate: "Sfax" });
const sellers = [karim, sami, leila];
console.log(`  ✓ 4 users (password: ${PASSWORD})`);

// Each car: specs + an auction plan. opening = 80% of price, reserve = price.
const CARS = [
  { make: "BMW", model: "Série 3 320i", year: 2019, mileage: 78_000, fuel: "gasoline", transmission: "automatic", color: "Noir", category: "sedan", city: "Tunis", price: 72_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-24), ends_at: hoursFromNow(30),
      bids: [{ user: karim, amount: 58_000 }, { user: sami, amount: 61_000 }, { user: leila, amount: 64_000 }] } },
  { make: "Volkswagen", model: "Golf 7 GTD", year: 2017, mileage: 120_000, fuel: "diesel", transmission: "manual", color: "Blanc", category: "hatchback", city: "Sfax", price: 45_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-18), ends_at: hoursFromNow(10),
      bids: [{ user: sami, amount: 36_000 }, { user: leila, amount: 39_000 }] } },
  { make: "Mercedes", model: "GLC 220d", year: 2020, mileage: 60_000, fuel: "diesel", transmission: "automatic", color: "Gris", category: "suv", city: "Sousse", price: 165_000,
    plan: { type: "sealed", status: "live", starts_at: hoursFromNow(-36), ends_at: daysFromNow(4),
      bids: [{ user: karim, amount: 135_000 }, { user: leila, amount: 150_000 }] } },
  { make: "Toyota", model: "Hilux 2.4 D-4D", year: 2018, mileage: 95_000, fuel: "diesel", transmission: "manual", color: "Blanc", category: "pickup", city: "Gabès", price: 98_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-12), ends_at: daysFromNow(2),
      bids: [{ user: sami, amount: 79_000 }, { user: karim, amount: 86_000 }] } },
  { make: "Peugeot", model: "208 1.2 PureTech", year: 2021, mileage: 32_000, fuel: "gasoline", transmission: "manual", color: "Rouge", category: "hatchback", city: "Ariana", price: 54_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-6), ends_at: hoursFromNow(18),
      bids: [{ user: leila, amount: 43_500 }, { user: karim, amount: 47_000 }] } },
  { make: "Audi", model: "A4 35 TFSI", year: 2019, mileage: 70_000, fuel: "gasoline", transmission: "automatic", color: "Bleu", category: "sedan", city: "Tunis", price: 89_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-20), ends_at: daysFromNow(3),
      bids: [{ user: karim, amount: 72_000 }, { user: sami, amount: 78_000 }, { user: leila, amount: 81_000 }] } },
  { make: "Renault", model: "Clio 5", year: 2020, mileage: 41_000, fuel: "gasoline", transmission: "manual", color: "Gris", category: "hatchback", city: "Nabeul", price: 46_000,
    plan: { type: "english", status: "scheduled", starts_at: daysFromNow(2), ends_at: daysFromNow(9), bids: [] } },
  { make: "Kia", model: "Sportage", year: 2018, mileage: 88_000, fuel: "diesel", transmission: "automatic", color: "Noir", category: "suv", city: "Monastir", price: 78_000,
    plan: { type: "english", status: "scheduled", starts_at: daysFromNow(3), ends_at: daysFromNow(10), bids: [] } },
  { make: "Volkswagen", model: "Touareg V6 TDI", year: 2016, mileage: 140_000, fuel: "diesel", transmission: "automatic", color: "Noir", category: "suv", city: "Tunis", price: 115_000,
    plan: { type: "english", status: "live", starts_at: hoursFromNow(-30), ends_at: daysFromNow(2),
      bids: [{ user: sami, amount: 92_000 }, { user: karim, amount: 101_000 }] } },
  { make: "Ford", model: "Focus", year: 2017, mileage: 99_000, fuel: "gasoline", transmission: "manual", color: "Blanc", category: "hatchback", city: "Bizerte", price: 38_000,
    plan: { type: "english", status: "ended_sold", starts_at: daysFromNow(-9), ends_at: daysFromNow(-2),
      winner: karim, winnerAmount: 41_500, hammer: daysFromNow(-2),
      bids: [{ user: sami, amount: 30_500 }, { user: leila, amount: 36_000 }, { user: karim, amount: 41_500 }] } },
];

// Wipe prior demo-car data owned by our seed users so re-runs are clean.
console.log("→ Wiping prior demo cars…");
const { data: mine } = await sb.from("properties").select("id").in("owner_id", sellers);
const myIds = (mine ?? []).map((p) => p.id);
if (myIds.length) {
  const { data: aucs } = await sb.from("auctions").select("id").in("property_id", myIds);
  const aucIds = (aucs ?? []).map((a) => a.id);
  if (aucIds.length) {
    await sb.from("bids").delete().in("auction_id", aucIds);
    await sb.from("auction_deposits").delete().in("auction_id", aucIds);
    await sb.from("sixth_offers").delete().in("auction_id", aucIds);
    await sb.from("watchlist").delete().in("auction_id", aucIds);
    await sb.from("auctions").delete().in("id", aucIds);
  }
  await sb.from("property_photos").delete().in("property_id", myIds);
  await sb.from("property_documents").delete().in("property_id", myIds);
  await sb.from("properties").delete().in("id", myIds);
  console.log(`  ✓ removed ${myIds.length} old listings`);
}

console.log("→ Inserting cars + auctions…");
let n = 0, nb = 0;
for (let i = 0; i < CARS.length; i++) {
  const c = CARS[i];
  const owner = sellers[i % sellers.length];
  const title = `${c.make} ${c.model} ${c.year}`;
  const { data: prop, error: pe } = await sb.from("properties").insert({
    owner_id: owner, title,
    description: `${c.make} ${c.model} · ${c.year} · ${c.mileage.toLocaleString("fr-FR")} km · ${c.fuel} · ${c.transmission} · ${c.color}.`,
    type: c.category, governorate: c.city, status: "ready",
    reviewed_by: admin, reviewed_at: new Date().toISOString(),
    attributes: { make: c.make, model: c.model, year: c.year, mileage: c.mileage, fuel: c.fuel, transmission: c.transmission, color: c.color },
  }).select("id").single();
  if (pe) throw new Error(`property insert (${title}): ${pe.message}`);

  const p = c.plan;
  const opening = Math.round(c.price * 0.8);
  const bids = p.bids ?? [];
  const { data: a, error: ae } = await sb.from("auctions").insert({
    property_id: prop.id, type: p.type ?? "english", listing_type: "auction",
    opening_price: opening, reserve_price: c.price,
    starts_at: p.starts_at, ends_at: p.ends_at, status: p.status,
    current_price: bids.length ? Math.max(...bids.map((b) => b.amount)) : opening,
    winner_user_id: p.winner ?? null, winner_amount: p.winnerAmount ?? null, hammer_at: p.hammer ?? null,
  }).select("id").single();
  if (ae) throw new Error(`auction insert (${title}): ${ae.message}`);

  for (const uid of [...new Set(bids.map((b) => b.user))]) {
    await sb.from("auction_deposits").insert({ auction_id: a.id, user_id: uid, amount: Math.round(opening * 0.05) });
  }
  let when = new Date(p.starts_at).getTime() + 60_000;
  for (const b of bids) {
    await sb.from("bids").insert({ auction_id: a.id, bidder_id: b.user, amount: b.amount, placed_at: new Date(when).toISOString() });
    when += 120_000;
    nb++;
  }
  n++;
}

console.log(`\n✅ Seeded ${n} cars, ${nb} bids.`);
console.log(`Login (password ${PASSWORD}): admin@mazed.tn · karim@mazed.tn · sami@mazed.tn · leila@mazed.tn`);
