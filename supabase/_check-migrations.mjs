#!/usr/bin/env node
/**
 * Verify every `migrate-*.sql` file in this directory is referenced by
 * `_build-apply-all.ps1`. Catches the failure mode where a new migration
 * is committed but the bundle wasn't regenerated — the file ships, but
 * nothing applies it on the next fresh deploy.
 *
 * Exits non-zero with a list of missing entries when out of sync. Wire
 * into CI / a pre-push hook to make the drift visible immediately.
 *
 * Usage: `node supabase/_check-migrations.mjs` (or `npm run migrations:check`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buildScript = join(here, "_build-apply-all.ps1");

// One-offs that legitimately live outside the bundle (data fixes, ad-hoc
// privilege grants tied to a specific environment, etc.). Add deliberately,
// never reflexively.
const EXEMPT = new Set([
  // grant-admin-*.sql lives here too, but the glob below already filters
  // to `migrate-*.sql` so it's auto-excluded.
]);

const files = readdirSync(here)
  .filter((f) => f.startsWith("migrate-") && f.endsWith(".sql"))
  .sort();

const script = readFileSync(buildScript, "utf8");

const missing = files.filter(
  (f) => !EXEMPT.has(f) && !script.includes(`"${f}"`),
);

if (missing.length === 0) {
  console.log(`✓ All ${files.length} migrations referenced in _build-apply-all.ps1`);
  process.exit(0);
}

console.error(
  `✗ ${missing.length} migration(s) NOT in _build-apply-all.ps1:`,
);
for (const f of missing) console.error(`    - ${f}`);
console.error(
  `\n  Fix: append to the $order array in supabase/_build-apply-all.ps1,`,
);
console.error(`  then re-run the script to regenerate _apply-all.sql.`);
process.exit(1);
