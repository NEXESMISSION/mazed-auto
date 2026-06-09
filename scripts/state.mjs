// Print the current DB state of Mazed Auto v2 (counts + distributions).
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const cnt = async (table, mod) => {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (mod) q = mod(q);
  const { count } = await q;
  return count ?? 0;
};
const dist = async (table, col) => {
  const { data } = await sb.from(table).select(col);
  const d = {};
  for (const r of data ?? []) d[r[col]] = (d[r[col]] || 0) + 1;
  return d;
};

const [profiles, props, aucAll, aucLive, aucSched, aucSold, photos, bids, deposits] = await Promise.all([
  cnt("profiles"), cnt("properties"), cnt("auctions"),
  cnt("auctions", (q) => q.eq("status", "live")),
  cnt("auctions", (q) => q.eq("status", "scheduled")),
  cnt("auctions", (q) => q.eq("status", "ended_sold")),
  cnt("property_photos"), cnt("bids"), cnt("auction_deposits"),
]);
const roleDist = await dist("profiles", "role");
const typeDist = await dist("properties", "type");

console.log("╔══════════════════════════════════════════════════╗");
console.log("║   MAZED AUTO v2 — current database state          ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`Users (profiles) : ${profiles}   ${JSON.stringify(roleDist)}`);
console.log(`Vehicles         : ${props}   ${JSON.stringify(typeDist)}`);
console.log(`Auctions         : ${aucAll}   (live ${aucLive} · scheduled ${aucSched} · sold ${aucSold})`);
console.log(`Photos           : ${photos}`);
console.log(`Bids             : ${bids}   ·   Deposits: ${deposits}`);
