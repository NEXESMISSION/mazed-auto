// ============================================================================
// Mazed Auto — import REAL car listings from the old mazed-auto Supabase.
//
// The old project (ref erosazbplfhelvxweeyz) holds 322 real car auctions
// scraped from tayara/mazauto, each with a full photo gallery already hosted
// on its Supabase Storage (auction-media, public). v2's next.config allows any
// *.supabase.co storage URL, so we hotlink those photos directly — no re-upload.
//
// We map the old flat `auctions` row → v2's (properties + property_photos +
// auctions) shape, owned by demo "dealer" sellers, all as LIVE auctions.
//
// Reads:  OLD_URL / OLD_KEY (old project service key) via env.
// Writes: v2 project from .env.local (service role).
// Usage:  OLD_URL=… OLD_KEY=… LIMIT=60 node scripts/import-cars-from-old.mjs
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });

const V2_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const V2_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_URL = process.env.OLD_URL || "https://erosazbplfhelvxweeyz.supabase.co";
const OLD_KEY = process.env.OLD_KEY;
if (!V2_URL || !V2_SVC || !OLD_KEY) { console.error("Need v2 .env.local + OLD_KEY"); process.exit(1); }
const LIMIT = Number(process.env.LIMIT || 60);

const v2 = createClient(V2_URL, V2_SVC, { auth: { persistSession: false } });
const old = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });

const PASSWORD = "Mazed!2026";
const CATS = new Set(["sedan", "suv", "hatchback", "pickup", "van", "coupe", "convertible", "wagon"]);
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const daysFromNow = (d) => new Date(Date.now() + d * 86_400_000).toISOString();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function ensureUser({ email, fullName, role, governorate }) {
  const { data: list } = await v2.auth.admin.listUsers({ perPage: 200 });
  let id = list?.users.find((u) => u.email === email)?.id;
  if (!id) {
    const { data, error } = await v2.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: fullName, role },
      app_metadata: role === "admin" ? { role: "admin" } : undefined,
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    id = data.user.id;
  }
  await v2.from("profiles").update({
    full_name: fullName, role, governorate,
    kyc_status: "verified", kyc_verified_at: new Date().toISOString(), trust_score: 85,
  }).eq("id", id);
  return id;
}

console.log("→ Demo users…");
const admin = await ensureUser({ email: "admin@mazed.tn", fullName: "Admin Mazed", role: "admin", governorate: "Tunis" });
const dealers = [];
for (const [email, name, gov] of [
  ["autodeal.tunis@mazed.tn", "Auto Deal · Tunis", "Tunis"],
  ["premiumcars.sfax@mazed.tn", "Premium Cars · Sfax", "Sfax"],
  ["megamotors.sousse@mazed.tn", "Mega Motors · Sousse", "Sousse"],
]) dealers.push(await ensureUser({ email, fullName: name, role: "agency", governorate: gov }));
const karim = await ensureUser({ email: "karim@mazed.tn", fullName: "Karim Bouazizi", role: "individual", governorate: "Tunis" });
const sami = await ensureUser({ email: "sami@mazed.tn", fullName: "Sami Trabelsi", role: "individual", governorate: "Sousse" });
const leila = await ensureUser({ email: "leila@mazed.tn", fullName: "Leila Mhiri", role: "individual", governorate: "Sfax" });
const bidders = [karim, sami, leila];

console.log(`→ Fetching up to ${LIMIT} cars from old project…`);
const { data: rows, error } = await old.from("auctions")
  .select("make,model,year,mileage,fuel_type,transmission,color,condition,category,description,features,city,region,image_urls,starting_price,reserve_price,buy_now_price,is_featured,is_vip")
  .not("image_urls", "is", null)
  .order("is_vip", { ascending: false })
  .limit(LIMIT);
if (error) throw new Error(`old fetch: ${error.message}`);
const cars = (rows ?? []).filter((c) => Array.isArray(c.image_urls) && c.image_urls.length && c.make && c.model);
console.log(`  ✓ ${cars.length} usable cars`);

// Wipe any prior listings owned by our demo sellers (clean re-runs).
console.log("→ Wiping prior demo/imported cars…");
const owners = [...dealers, ...bidders];
const { data: mine } = await v2.from("properties").select("id").in("owner_id", owners);
const myIds = (mine ?? []).map((p) => p.id);
if (myIds.length) {
  const { data: aucs } = await v2.from("auctions").select("id").in("property_id", myIds);
  const aucIds = (aucs ?? []).map((a) => a.id);
  if (aucIds.length) {
    for (const t of ["bids", "auction_deposits", "sixth_offers", "watchlist"]) await v2.from(t).delete().in("auction_id", aucIds);
    await v2.from("auctions").delete().in("id", aucIds);
  }
  await v2.from("property_photos").delete().in("property_id", myIds);
  await v2.from("property_documents").delete().in("property_id", myIds);
  await v2.from("properties").delete().in("id", myIds);
  console.log(`  ✓ removed ${myIds.length} old listings`);
}

console.log("→ Importing…");
let n = 0, nph = 0, nb = 0;
for (let i = 0; i < cars.length; i++) {
  const c = cars[i];
  const owner = dealers[i % dealers.length];
  const type = CATS.has(c.category) ? c.category : "sedan";
  const title = `${c.make} ${c.model} ${c.year}`.replace(/\s+/g, " ").trim();
  const governorate = c.city || c.region || "Tunis";

  const { data: prop, error: pe } = await v2.from("properties").insert({
    owner_id: owner, title,
    description: c.description ?? `${c.make} ${c.model} ${c.year}.`,
    type, governorate, status: "ready",
    reviewed_by: admin, reviewed_at: new Date().toISOString(),
    attributes: {
      make: c.make, model: c.model, year: c.year, mileage: c.mileage,
      fuel: c.fuel_type, transmission: c.transmission, color: c.color,
      condition: c.condition, region: c.region,
      features: Array.isArray(c.features) ? c.features : [],
    },
  }).select("id").single();
  if (pe) { console.warn(`  skip ${title}: ${pe.message}`); continue; }

  const photos = c.image_urls.slice(0, 10).map((u, idx) => ({ property_id: prop.id, storage_path: u, sort_order: idx, caption: null }));
  await v2.from("property_photos").insert(photos);
  nph += photos.length;

  const starting = c.starting_price > 0 ? Math.round(c.starting_price) : Math.round((c.buy_now_price || 40000) * 0.8);
  const reserve = c.reserve_price && c.reserve_price >= starting ? Math.round(c.reserve_price) : null;
  const buyNow = c.buy_now_price && c.buy_now_price > starting ? Math.round(c.buy_now_price) : null;

  // Light bidding on ~40% of lots so the home feels alive.
  const bids = [];
  if (Math.random() < 0.4) {
    const u1 = pick(bidders);
    let u2 = pick(bidders); if (u2 === u1) u2 = bidders[(bidders.indexOf(u1) + 1) % bidders.length];
    bids.push({ user: u1, amount: Math.round(starting * 1.04) });
    if (Math.random() < 0.6) bids.push({ user: u2, amount: Math.round(starting * 1.1) });
  }

  const { data: a, error: ae } = await v2.from("auctions").insert({
    property_id: prop.id, type: "english", listing_type: "auction",
    opening_price: starting, reserve_price: reserve, buy_now_price: buyNow,
    starts_at: hoursFromNow(-Math.round(rnd(2, 96))), ends_at: daysFromNow(rnd(1, 7)),
    status: "live", current_price: bids.length ? Math.max(...bids.map((b) => b.amount)) : starting,
  }).select("id").single();
  if (ae) { console.warn(`  auction skip ${title}: ${ae.message}`); n++; continue; }

  for (const uid of [...new Set(bids.map((b) => b.user))]) {
    await v2.from("auction_deposits").insert({ auction_id: a.id, user_id: uid, amount: Math.round(starting * 0.05) });
  }
  let when = Date.now() - 3_600_000;
  for (const b of bids) {
    await v2.from("bids").insert({ auction_id: a.id, bidder_id: b.user, amount: b.amount, placed_at: new Date(when).toISOString() });
    when += 600_000; nb++;
  }
  n++;
  if (n % 10 === 0) console.log(`  …${n}`);
}

console.log(`\n✅ Imported ${n} cars, ${nph} photos, ${nb} bids.`);
console.log(`Sellers: autodeal.tunis@ / premiumcars.sfax@ / megamotors.sousse@mazed.tn · bidders: karim/sami/leila@mazed.tn · pwd ${PASSWORD}`);
