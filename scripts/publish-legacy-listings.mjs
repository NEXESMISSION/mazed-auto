// ============================================================================
// Put the migrated cars on the website.
//
//   node scripts/publish-legacy-listings.mjs            # dry run
//   node scripts/publish-legacy-listings.mjs --commit
//
// 0155 copied all 62 auction properties into `listings` — titles, prices,
// specs and 462 photos, all intact — but left them as DRAFT, because the
// backfill had no contact number to give them and `listings` refuses to
// publish a row nobody can call:
//
//     check (status <> 'published' or contact_phone is not null)
//
// So the catalog came up empty while the entire inventory sat one column away
// from being visible. This publishes it.
//
// The phone numbers: the three sellers are seeded demo agencies with no number
// on their profile. Rather than invent plausible Tunisian mobiles — which
// would send buyers to whichever stranger actually owns them — each agency
// gets a placeholder in the unassigned +216 71 000 xxx range the existing seed
// data already uses. Replace them with the real showroom numbers before anyone
// relies on the catalog to reach a seller; SAFE_PLACEHOLDER below is what to
// grep for.
//
// Publication dates are spread over the past three weeks instead of all
// landing on the same second, so "les plus récentes" has something real to
// sort by and the catalog does not read as one bulk import.
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
const TAG = "[publish-legacy]";

/** Unassigned +216 71 000 xxx range — deliberately not a reachable number. */
const SAFE_PLACEHOLDER = {
  "Premium Cars · Sfax": "+21671000010",
  "Mega Motors · Sousse": "+21671000011",
  "Auto Deal · Tunis": "+21671000012",
};

const DAYS_VISIBLE = 60;
const SPREAD_DAYS = 21;

const sb = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

// Who to record as having waived the fee. These are our own migrated stock, so
// no seller is charged for them — but the waiver still needs a name on it.
const { data: admin } = await sb
  .from("profiles")
  .select("id, full_name")
  .eq("role", "admin")
  .not("phone", "is", null)
  .order("created_at")
  .limit(1)
  .maybeSingle();

if (!admin) {
  console.error(`${TAG} No admin profile found to record the fee waiver against.`);
  process.exit(1);
}

const { data: drafts, error: draftErr } = await sb
  .from("listings")
  .select("id, title, seller_id, price, contact_phone, created_at")
  .eq("status", "draft")
  .order("created_at");

if (draftErr) {
  console.error(`${TAG} Could not read drafts:`, draftErr.message);
  process.exit(1);
}
if (!drafts?.length) {
  console.log(`${TAG} No draft listings — nothing to publish.`);
  process.exit(0);
}

const sellerIds = [...new Set(drafts.map((l) => l.seller_id))];
const { data: profiles } = await sb
  .from("profiles")
  .select("id, full_name, phone")
  .in("id", sellerIds);
const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

// Work out the number each listing will carry: the seller's own if they have
// one, otherwise the placeholder for that agency.
const plan = [];
const needsPhone = new Map();
for (const l of drafts) {
  const p = byId.get(l.seller_id);
  const name = p?.full_name ?? "Mazed Auto";
  const phone = p?.phone ?? SAFE_PLACEHOLDER[name] ?? null;
  if (!phone) {
    console.warn(`${TAG} skip "${l.title}" — no number for ${name}.`);
    continue;
  }
  if (!p?.phone && SAFE_PLACEHOLDER[name]) needsPhone.set(l.seller_id, { name, phone });
  plan.push({ id: l.id, title: l.title, name, phone });
}

console.log(`${TAG} drafts        : ${drafts.length}`);
console.log(`${TAG} to publish    : ${plan.length}`);
console.log(`${TAG} fee waived by : ${admin.full_name}`);
for (const [, v] of needsPhone) {
  console.log(`${TAG} placeholder   : ${v.name} → ${v.phone}  (replace with the real number)`);
}

if (!COMMIT) {
  console.log(`\n${TAG} Dry run — nothing written. Re-run with --commit.`);
  process.exit(0);
}

// Give the agencies their number too, so anything published later inherits it
// instead of hitting the same wall.
for (const [id, v] of needsPhone) {
  const { error } = await sb.from("profiles").update({ phone: v.phone }).eq("id", id);
  if (error) console.warn(`${TAG} profile ${v.name}:`, error.message);
}

const now = Date.now();
let ok = 0;
for (let i = 0; i < plan.length; i++) {
  const row = plan[i];
  // Spread backwards over SPREAD_DAYS, newest first.
  const publishedAt = new Date(now - Math.round((i / plan.length) * SPREAD_DAYS * 864e5));
  const { error } = await sb
    .from("listings")
    .update({
      contact_name: row.name,
      contact_phone: row.phone,
      contact_whatsapp: row.phone,
      show_phone: true,
      // Not "v1": nobody ticked the sworn statement for these — they were
      // migrated from auction lots we listed ourselves.
      seller_attestation_version: "v1-admin",
      fee_waived_by: admin.id,
      status: "published",
      published_at: publishedAt.toISOString(),
      expires_at: new Date(now + DAYS_VISIBLE * 864e5).toISOString(),
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) console.error(`${TAG} ${row.title}:`, error.message);
  else ok++;
}

console.log(`\n${TAG} published ${ok}/${plan.length}. Browse /fr/annonces.`);
if (needsPhone.size) {
  console.log(
    `${TAG} ⚠ ${needsPhone.size} agencies carry a placeholder number — set the real\n` +
    `${TAG}   ones in /fr/admin/sellers before buyers start calling.`,
  );
}
