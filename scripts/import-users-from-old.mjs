// ============================================================================
// Mazed Auto — import the OLD project's real user accounts into v2.
//
// The old project (erosazbplfhelvxweeyz) has no `profiles` table; user info
// lives in auth.users `user_metadata` (firstName/lastName/role/kycStatus/phone/
// trustScore). We recreate each account in v2 and map that metadata into v2's
// `public.profiles` shape. Old passwords aren't recoverable, so every imported
// account gets the shared demo password below.
//
// Reads:  OLD_URL / OLD_KEY (old service key).
// Writes: v2 from .env.local (service role).
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });

const v2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const old = createClient(process.env.OLD_URL, process.env.OLD_KEY, { auth: { persistSession: false } });
const PASSWORD = "Mazed!2026";

const mapRole = (r) => {
  r = String(r || "").toLowerCase();
  if (r === "admin") return "admin";
  if (["agency", "dealer", "pro", "agence"].includes(r)) return "agency";
  if (["inspector", "expert"].includes(r)) return "inspector";
  if (r === "bank") return "bank";
  if (r === "bailiff") return "bailiff";
  return "individual"; // buyer / seller / user / null
};
const mapKyc = (k) => {
  k = String(k || "none").toLowerCase();
  return ["none", "submitted", "pending", "verified", "rejected"].includes(k) ? k : "none";
};

// Collect all old auth users (paginated).
const oldUsers = [];
for (let page = 1; ; page++) {
  const { data, error } = await old.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`old listUsers: ${error.message}`);
  const u = data?.users ?? [];
  oldUsers.push(...u);
  if (u.length < 200) break;
}
console.log(`→ ${oldUsers.length} old auth users`);

// Index existing v2 users by email so re-runs don't duplicate.
const v2Existing = new Map();
for (let page = 1; ; page++) {
  const { data } = await v2.auth.admin.listUsers({ page, perPage: 200 });
  const u = data?.users ?? [];
  for (const x of u) if (x.email) v2Existing.set(x.email.toLowerCase(), x.id);
  if (u.length < 200) break;
}

let created = 0, patched = 0, skipped = 0;
for (const u of oldUsers) {
  const m = u.user_metadata ?? {};
  const email = (u.email || m.email || "").toLowerCase();
  if (!email) { skipped++; continue; }
  const fullName = m.full_name || [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || email.split("@")[0];
  const phone = m.phone || u.phone || null;
  const role = mapRole(m.role);
  const kyc = mapKyc(m.kycStatus || m.kyc_status);

  let id = v2Existing.get(email);
  if (!id) {
    const { data, error } = await v2.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: fullName, phone, role, imported_from: "mazed-auto-v1" },
      app_metadata: role === "admin" ? { role: "admin" } : undefined,
    });
    if (error) { console.warn(`  skip ${email}: ${error.message}`); skipped++; continue; }
    id = data.user.id;
    created++;
  }
  await v2.from("profiles").update({
    full_name: fullName, phone, role,
    kyc_status: kyc,
    kyc_verified_at: kyc === "verified" ? new Date().toISOString() : null,
    trust_score: Math.min(100, Math.max(0, Math.round(Number(m.trustScore) || 0))),
    governorate: m.governorate || m.city || "Tunis",
  }).eq("id", id);
  patched++;
}

console.log(`\n✅ Old users imported: ${created} created, ${patched} profiles patched, ${skipped} skipped.`);
console.log(`All imported accounts use password: ${PASSWORD}`);
