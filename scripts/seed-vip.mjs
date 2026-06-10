// Flag ~10 live listings as promo_home_featured so the home "Sélection VIP"
// rail (and the existing paid-placement sort) has something to surface.
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Reset first (idempotent), then flag a fresh set.
await sb.from("properties").update({ promo_home_featured: false }).eq("promo_home_featured", true);
const { data: props, error: e1 } = await sb.from("properties").select("id").eq("status", "ready").limit(10);
if (e1) { console.error("select:", e1.message); process.exit(1); }
const ids = (props ?? []).map((p) => p.id);
const { error } = await sb.from("properties").update({ promo_home_featured: true }).in("id", ids);
console.log(error ? "ERR " + error.message : `flagged ${ids.length} VIP listings`);
