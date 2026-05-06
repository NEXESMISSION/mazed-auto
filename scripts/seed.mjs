// One-shot seed runner. Uses the service-role key to bypass RLS.
// Run from `web/`:  node scripts/seed.mjs
//
// NOTE: this is a smaller, JS-based subset of `supabase/seed.sql` for quick
// programmatic seeding. The canonical, richer seed (22 auctions, 14 sellers,
// 75+ bids) is `supabase/seed.sql` — paste it into Supabase SQL Editor.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dep)
const envText = readFileSync(resolve(here, "..", ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const carImg = (seed) =>
  `https://images.unsplash.com/photo-${seed}?w=1200&h=800&fit=crop&q=80`;
const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const now = Date.now();
const hours = (h) => new Date(now + h * 3600 * 1000).toISOString();

async function main() {
  console.log("• Seeding sellers...");
  const sellers = [
    { id: "11111111-1111-1111-1111-111111111111", username: "ahmed_tn",   display_name: "Ahmed Ben Ali",     trust_score: 178, trust_level: "very_trusted", verified_kyc: true, verified_ownership: true, successful_deals: 14, rating_average: 4.80, rating_count: 12, account_age_months: 22, city: "Tunis",   is_pro: false },
    { id: "22222222-2222-2222-2222-222222222222", username: "auto_pro",   display_name: "Agence AutoPro",    trust_score: 312, trust_level: "verified_pro", verified_kyc: true, verified_ownership: true, successful_deals: 87, rating_average: 4.90, rating_count: 76, account_age_months: 38, city: "Sfax",    is_pro: true  },
    { id: "33333333-3333-3333-3333-333333333333", username: "salma_b",    display_name: "Salma Bouzid",      trust_score: 95,  trust_level: "trusted",      verified_kyc: true, verified_ownership: true, successful_deals: 3,  rating_average: 4.50, rating_count: 3,  account_age_months: 9,  city: "Sousse",  is_pro: false },
    { id: "44444444-4444-4444-4444-444444444444", username: "med_garage", display_name: "Mohamed Trabelsi",  trust_score: 142, trust_level: "trusted",      verified_kyc: true, verified_ownership: true, successful_deals: 8,  rating_average: 4.60, rating_count: 7,  account_age_months: 15, city: "Bizerte", is_pro: false },
    { id: "55555555-5555-5555-5555-555555555555", username: "new_seller", display_name: "Karim Hammi",       trust_score: 42,  trust_level: "low",          verified_kyc: true, verified_ownership: true, successful_deals: 0,  rating_average: 0,    rating_count: 0,  account_age_months: 1,  city: "Nabeul",  is_pro: false },
  ];
  const r1 = await sb.from("sellers").upsert(sellers, { onConflict: "id" });
  if (r1.error) throw r1.error;
  console.log("  ✓ sellers ok");

  console.log("• Seeding auctions...");
  const auctions = [
    {
      id: "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa",
      seller_id: "11111111-1111-1111-1111-111111111111",
      make: "Renault", model: "Clio", year: 2022, mileage: 28000,
      fuel_type: "gasoline", transmission: "manual", color: "Blanc",
      condition: "excellent", category: "hatchback",
      description: "Véhicule en excellent état, entretien régulier en concession, usage personnel uniquement.",
      features: ["Climatisation","ABS","Airbags","Système audio","Bluetooth","Caméra de recul"],
      city: "Tunis", region: "Grand Tunis",
      image_urls: [
        carImg("1583121274602-3e2820c69888"), carImg("1494976388531-d1058494cdd8"),
        carImg("1503376780353-7e6692767b70"), carImg("1502877338535-766e1452684a"),
        carImg("1542362567-b07e54358753"),    carImg("1494976388531-d1058494cdd8"),
        carImg("1503376780353-7e6692767b70"), carImg("1502877338535-766e1452684a"),
        carImg("1542362567-b07e54358753"),    carImg("1494976388531-d1058494cdd8"),
        carImg("1503376780353-7e6692767b70"), carImg("1502877338535-766e1452684a"),
      ],
      video_url: "/loading.png",
      starting_price: 32000, reserve_price: 38000, buy_now_price: 45000,
      current_price: 36500, participation_deposit: 1600, bid_increment: 500,
      start_time: hours(-24), end_time: hours(28), original_end_time: hours(28),
      status: "active", reserve_met: false, total_bids: 14, total_participants: 6,
      is_featured: true, is_vip: false, alerts: [],
    },
    {
      id: "aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa",
      seller_id: "22222222-2222-2222-2222-222222222222",
      make: "Peugeot", model: "208 GT", year: 2024, mileage: 0,
      fuel_type: "gasoline", transmission: "automatic", color: "Rouge",
      condition: "new", category: "hatchback",
      description: "Voiture neuve 0 km, full options, garantie concessionnaire 3 ans.",
      features: ["Climatisation numérique","ABS + ESP","6 Airbags","Caméra 360°","Apple CarPlay","Android Auto","Phares LED","Jantes 17 pouces"],
      city: "Sfax", region: "Sfax",
      image_urls: repeat(12, () => carImg("1606664515524-ed2f786a0bd6")),
      video_url: "/loading.png",
      starting_price: 68000, reserve_price: null, buy_now_price: 78000,
      current_price: 72000, participation_deposit: 3400, bid_increment: 1000,
      start_time: hours(-12), end_time: hours(2), original_end_time: hours(2),
      status: "ending", reserve_met: true, total_bids: 23, total_participants: 11,
      is_featured: true, is_vip: true, alerts: [],
    },
    {
      id: "aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa",
      seller_id: "33333333-3333-3333-3333-333333333333",
      make: "Volkswagen", model: "Golf 7", year: 2019, mileage: 78000,
      fuel_type: "diesel", transmission: "manual", color: "Gris",
      condition: "good", category: "hatchback",
      description: "Golf 7 TDI, économique en consommation, idéale pour les longs trajets.",
      features: ["Climatisation","ABS","Système de navigation","Caméra de recul","Volant chauffant"],
      city: "Sousse", region: "Sahel",
      image_urls: repeat(12, () => carImg("1471444928139-48c5bf5173f8")),
      video_url: null,
      starting_price: 38000, reserve_price: 42000, buy_now_price: null,
      current_price: 39500, participation_deposit: 1900, bid_increment: 500,
      start_time: hours(-48), end_time: hours(72), original_end_time: hours(72),
      status: "active", reserve_met: false, total_bids: 7, total_participants: 4,
      is_featured: false, is_vip: false,
      alerts: [{ type: "info", title: "Prix de départ 12% en dessous du marché", detail: "Le prix de marché actuel pour une Golf 7 2019 avec ce kilométrage est d'environ 43 000 DT", suggestion: "Peut être une bonne opportunité, ou une raison de vérifier" }],
    },
    {
      id: "aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa",
      seller_id: "44444444-4444-4444-4444-444444444444",
      make: "BMW", model: "320i", year: 2021, mileage: 45000,
      fuel_type: "gasoline", transmission: "automatic", color: "Noir",
      condition: "excellent", category: "sedan",
      description: "BMW 320i Sport Package, full options, révision complète en concession.",
      features: ["Pack M Sport","Cuir","Toit ouvrant","Harman Kardon","Affichage tête haute","Régulateur adaptatif"],
      city: "Bizerte", region: "Nord",
      image_urls: repeat(12, () => carImg("1555215695-3004980ad54e")),
      video_url: null,
      starting_price: 95000, reserve_price: 105000, buy_now_price: 130000,
      current_price: 102000, participation_deposit: 4750, bid_increment: 1000,
      start_time: hours(-6), end_time: hours(48), original_end_time: hours(48),
      status: "active", reserve_met: false, total_bids: 9, total_participants: 5,
      is_featured: true, is_vip: false, alerts: [],
    },
    {
      id: "aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa",
      seller_id: "55555555-5555-5555-5555-555555555555",
      make: "Toyota", model: "Yaris", year: 2020, mileage: 52000,
      fuel_type: "gasoline", transmission: "manual", color: "Bleu",
      condition: "good", category: "hatchback",
      description: "Yaris économique, faible consommation, entretien en concession.",
      features: ["Climatisation","ABS","Airbags","Système audio"],
      city: "Nabeul", region: "Centre-Est",
      image_urls: repeat(12, () => carImg("1549924231-f129b911e442")),
      video_url: null,
      starting_price: 28000, reserve_price: null, buy_now_price: null,
      current_price: 28500, participation_deposit: 1400, bid_increment: 250,
      start_time: hours(-2), end_time: hours(120), original_end_time: hours(120),
      status: "active", reserve_met: true, total_bids: 2, total_participants: 2,
      is_featured: false, is_vip: false,
      alerts: [{ type: "warning", title: "Nouveau vendeur sur la plateforme", detail: "Ce compte a moins d'un mois", suggestion: "Consultez la politique de la plateforme avant d'enchérir" }],
    },
    {
      id: "aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa",
      seller_id: "22222222-2222-2222-2222-222222222222",
      make: "Hyundai", model: "Tucson", year: 2023, mileage: 12000,
      fuel_type: "diesel", transmission: "automatic", color: "Blanc nacré",
      condition: "excellent", category: "suv",
      description: "Tucson Premium, SUV familial haut de gamme, quasi neuf.",
      features: ["Climatisation 3 zones","ABS + ESP","Caméra 360°","Système de navigation","Cuir","Toit panoramique","Assistance maintien de voie"],
      city: "Tunis", region: "Grand Tunis",
      image_urls: repeat(12, () => carImg("1606664515524-ed2f786a0bd6")),
      video_url: null,
      starting_price: 85000, reserve_price: 95000, buy_now_price: 110000,
      current_price: 92000, participation_deposit: 4250, bid_increment: 1000,
      start_time: hours(-18), end_time: hours(36), original_end_time: hours(36),
      status: "active", reserve_met: false, total_bids: 16, total_participants: 8,
      is_featured: true, is_vip: true, alerts: [],
    },
  ];
  const r2 = await sb.from("auctions").upsert(auctions, { onConflict: "id" });
  if (r2.error) throw r2.error;
  console.log("  ✓ auctions ok");

  console.log("• Seeding bids...");
  const bidsSeed = [
    { auction_id: "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa", bidder_label: "Ahmed K.", amount: 36500 },
    { auction_id: "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa", bidder_label: "Salma B.", amount: 36000 },
    { auction_id: "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa", bidder_label: "Karim H.", amount: 35500 },
    { auction_id: "aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa", bidder_label: "Mohamed T.", amount: 72000 },
    { auction_id: "aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa", bidder_label: "Fatma L.", amount: 71000 },
    { auction_id: "aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa", bidder_label: "Youssef R.", amount: 102000 },
    { auction_id: "aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa", bidder_label: "Houda N.", amount: 92000 },
  ];
  const r3 = await sb.from("bids").insert(bidsSeed);
  if (r3.error && !String(r3.error.message).includes("duplicate")) {
    console.warn("  ! bids:", r3.error.message);
  } else {
    console.log("  ✓ bids ok");
  }

  // Resync auction counters AFTER seeded bids (the bid trigger bumped current_price/total_bids).
  // Force them back to the canonical seeded numbers so the UI looks right.
  await sb.from("auctions").update({ current_price: 36500, total_bids: 14, total_participants: 6 }).eq("id", "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa");
  await sb.from("auctions").update({ current_price: 72000, total_bids: 23, total_participants: 11 }).eq("id", "aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa");
  await sb.from("auctions").update({ current_price: 102000, total_bids: 9, total_participants: 5 }).eq("id", "aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa");
  await sb.from("auctions").update({ current_price: 92000, total_bids: 16, total_participants: 8 }).eq("id", "aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa");

  console.log("• Seeding ratings...");
  const ratings = [
    { seller_id: "11111111-1111-1111-1111-111111111111", buyer_label: "Ahmed K.", rating: 5, comment: "Excellente expérience, voiture conforme à 100% à la description" },
    { seller_id: "11111111-1111-1111-1111-111111111111", buyer_label: "Salma B.", rating: 5, comment: "Vendeur très professionnel, fortement recommandé" },
    { seller_id: "11111111-1111-1111-1111-111111111111", buyer_label: "Karim H.", rating: 4, comment: "Tout est parfait, merci" },
    { seller_id: "22222222-2222-2222-2222-222222222222", buyer_label: "Mohamed L.", rating: 5, comment: "Concessionnaire fiable, transaction rapide et nette" },
    { seller_id: "22222222-2222-2222-2222-222222222222", buyer_label: "Houda N.", rating: 5, comment: "Très satisfait de la voiture, recommandé" },
  ];
  const r4 = await sb.from("seller_ratings").insert(ratings);
  if (r4.error && !String(r4.error.message).includes("duplicate")) {
    console.warn("  ! ratings:", r4.error.message);
  } else {
    console.log("  ✓ ratings ok");
  }

  console.log("• Seeding reports...");
  const reports = [
    { auction_id: "aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa", reporter_label: "Ahmed K.", reason: "images_mismatch",  detail: "Les photos ne correspondent pas à la version annoncée", severity: "high",   status: "open" },
    { auction_id: "aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa", reporter_label: "Salma B.", reason: "suspicious_price", detail: "Prix très bas par rapport au marché",                  severity: "normal", status: "open" },
    { auction_id: "aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa", reporter_label: "Karim H.", reason: "off_platform",     detail: "Le vendeur a demandé un contact hors plateforme",      severity: "high",   status: "reviewing" },
  ];
  const r5 = await sb.from("reports").insert(reports);
  if (r5.error && !String(r5.error.message).includes("duplicate")) {
    console.warn("  ! reports:", r5.error.message);
  } else {
    console.log("  ✓ reports ok");
  }

  console.log("• Seeding transactions...");
  const txs = [
    { ref: "TX-A1B2", user_label: "Ahmed Ben Ali",     type: "deposit",       direction: "in",  amount: 1600,   label: "Caution Renault Clio",         status: "completed" },
    { ref: "TX-C3D4", user_label: "Mohamed Trabelsi",  type: "final_payment", direction: "in",  amount: 105250, label: "Paiement final BMW 320i",      status: "completed" },
    { ref: "TX-E5F6", user_label: "Salma Bouzid",      type: "refund",        direction: "out", amount: 1400,   label: "Remboursement Toyota Yaris",   status: "completed" },
    { ref: "TX-G7H8", user_label: "Mazed Auto",        type: "commission",    direction: "in",  amount: 7368,   label: "Commission 7% — BMW 320i",     status: "completed" },
    { ref: "TX-I9J0", user_label: "Karim Hammi",       type: "deposit",       direction: "in",  amount: 3400,   label: "Caution Peugeot 208",          status: "pending" },
    { ref: "TX-K1L2", user_label: "Agence AutoPro",    type: "payout",        direction: "out", amount: 97882,  label: "Virement au vendeur — BMW 320i", status: "processing" },
  ];
  const r6 = await sb.from("transactions").upsert(txs, { onConflict: "ref" });
  if (r6.error) throw r6.error;
  console.log("  ✓ transactions ok");

  console.log("• Seeding platform stats...");
  const r7 = await sb.from("platform_stats").upsert(
    { id: 1, active_auctions: 1247, completed_deals: 3829, verified_sellers: 5621, satisfaction: 4.8 },
    { onConflict: "id" },
  );
  if (r7.error) throw r7.error;
  console.log("  ✓ stats ok");

  console.log("\n✓ All seeded.");
  const { count: aCount } = await sb.from("auctions").select("id", { count: "exact", head: true });
  const { count: sCount } = await sb.from("sellers").select("id", { count: "exact", head: true });
  console.log(`  ${aCount} auctions, ${sCount} sellers`);
}

main().catch((e) => {
  console.error("\nSEED FAILED:", e.message ?? e);
  process.exit(1);
});
