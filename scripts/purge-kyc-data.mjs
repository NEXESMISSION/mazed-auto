// ============================================================================
// Destroy the KYC data — deliberately, and only when the owner says so.
//
//   node scripts/purge-kyc-data.mjs                 # dry run: what would go
//   node scripts/purge-kyc-data.mjs --export ./out  # write the export, no deletes
//   node scripts/purge-kyc-data.mjs --export ./out --commit   # export, then delete
//
// WHY THIS IS A SCRIPT AND NOT A MIGRATION
//
// The rest of the KYC removal is code and machinery — reversible, reviewable,
// and safe to run from CI. This part is different: `kyc_submissions` points at
// CIN photographs and selfies of real Tunisian citizens sitting in a private
// bucket. Deleting them is irreversible, and it is a data-protection decision,
// not an engineering one. Whoever runs this should mean it.
//
// The export writes the row metadata as JSON and downloads every object so the
// obligation to keep records for as long as the law requires can be met OUTSIDE
// the product. Keep that folder somewhere appropriate — it is the most
// sensitive data this company holds — and delete it when the retention period
// is over.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

loadEnv({ path: ".env.local" });

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const exportIdx = argv.indexOf("--export");
const EXPORT_DIR = exportIdx >= 0 ? argv[exportIdx + 1] : null;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: rows, error: rowErr } = await sb.from("kyc_submissions").select("*");
if (rowErr) {
  console.error("cannot read kyc_submissions:", rowErr.message);
  process.exit(1);
}

const { data: objects, error: objErr } = await sb.storage.from("kyc").list("", { limit: 1000 });
if (objErr) console.warn("cannot list the kyc bucket:", objErr.message);

// The bucket is nested per user, so walk one level down as well.
const files = [];
for (const top of objects ?? []) {
  if (top.id === null) {
    const { data: inner } = await sb.storage.from("kyc").list(top.name, { limit: 1000 });
    for (const f of inner ?? []) files.push(`${top.name}/${f.name}`);
  } else {
    files.push(top.name);
  }
}

console.log(`kyc_submissions rows : ${rows.length}`);
console.log(`kyc bucket objects   : ${files.length}`);

if (EXPORT_DIR) {
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(
    path.join(EXPORT_DIR, "kyc_submissions.json"),
    JSON.stringify(rows, null, 2),
    "utf8",
  );
  let saved = 0;
  for (const f of files) {
    const { data, error } = await sb.storage.from("kyc").download(f);
    if (error || !data) {
      console.warn("  could not download", f, error?.message ?? "");
      continue;
    }
    const dest = path.join(EXPORT_DIR, "objects", f);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    saved++;
  }
  console.log(`exported to ${EXPORT_DIR}: 1 JSON + ${saved} file(s)`);
  console.log("KEEP THIS SOMEWHERE APPROPRIATE. It is ID photography.");
}

if (!COMMIT) {
  console.log("\nDry run — nothing deleted.");
  console.log("To destroy: re-run with --export <dir> --commit");
  process.exit(0);
}

if (!EXPORT_DIR) {
  console.error("\nRefusing to delete without --export: take the copy first.");
  process.exit(1);
}

if (files.length > 0) {
  const { error } = await sb.storage.from("kyc").remove(files);
  if (error) { console.error("bucket delete failed:", error.message); process.exit(1); }
  console.log(`deleted ${files.length} object(s) from the kyc bucket`);
}

const { error: delErr } = await sb.from("kyc_submissions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (delErr) { console.error("row delete failed:", delErr.message); process.exit(1); }
console.log(`deleted ${rows.length} kyc_submissions row(s)`);

console.log("\nDone. Drop the empty table and the enum when you are ready:");
console.log("  drop table public.kyc_submissions;");
console.log("  alter table public.profiles drop column kyc_status;");
console.log("  drop type public.kyc_status;");
console.log("  delete from storage.buckets where id = 'kyc';");
