/**
 * Refuse to start `next dev` on a corrupt build cache.
 *
 * THE FAILURE THIS EXISTS FOR. The dev server rendered every page as the error
 * boundary — « Quelque chose s'est mal passé » — with one line in the log:
 *
 *     SyntaxError: Unexpected end of JSON input
 *         at JSON.parse (<anonymous>) { page: '/fr' }
 *
 * No route in this app parses JSON while rendering `/fr`, and no code change
 * caused it: `rm -rf .next` fixed it completely. The thrower is Next itself,
 * reading one of its own cache manifests that was left half-written — which is
 * what happens when a dev server dies mid-write, and on this machine it has
 * happened more than once (a Turbopack cache went the same way earlier, after
 * Windows exhausted its paging file).
 *
 * It is a nasty failure precisely because it does not look like one. The
 * server starts, every route answers HTTP 200, and the page renders a
 * perfectly styled "something went wrong" — so it reads as a bug in whatever
 * you happened to be looking at. The first instinct is to debug the search,
 * or the last commit. Neither has anything to do with it.
 *
 * WHY IT VALIDATES RATHER THAN JUST DELETING. Clearing `.next` on every start
 * would cost a full cold compile every time — a minute here — to guard against
 * something that happens rarely. Parsing the cache's manifests takes
 * milliseconds and only clears when one is actually broken, so a healthy cache
 * is left alone and a broken one never reaches Next.
 *
 * Wired to `predev`, so `npm run dev` runs it automatically.
 */
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NEXT_DIR = path.join(ROOT, ".next");

/**
 * Only the manifests Next reads back at boot, and only at the top of the
 * cache. Walking every file under `.next` means parsing tens of thousands of
 * chunks that Next never JSON-parses, which would turn a millisecond check
 * into a slow one for no extra safety.
 */
const SCAN_DIRS = ["", "server", "static", "cache", "types", "dev", "dev/types"];

/** Files Next writes and reads back; a truncated one is what breaks the boot. */
const isManifest = (name) => name.endsWith(".json");

function corruptFilesIn(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // directory absent — nothing to validate
  }

  const bad = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isManifest(entry.name)) continue;
    const file = path.join(dir, entry.name);
    try {
      const raw = readFileSync(file, "utf8");
      // An empty manifest is as fatal as a truncated one, and `JSON.parse("")`
      // throws the same message, so both land here.
      JSON.parse(raw);
    } catch (err) {
      bad.push({ file: path.relative(ROOT, file), why: err.message });
    }
  }
  return bad;
}

function main() {
  try {
    statSync(NEXT_DIR);
  } catch {
    return; // no cache yet: a cold start is already clean
  }

  const corrupt = SCAN_DIRS.flatMap((sub) =>
    corruptFilesIn(sub ? path.join(NEXT_DIR, sub) : NEXT_DIR),
  );

  if (corrupt.length === 0) return;

  console.warn(
    `\n  Corrupt Next cache — clearing .next before starting.\n`
      + `  This is the "Unexpected end of JSON input" failure, where every page\n`
      + `  renders the error boundary and nothing in your code is wrong.\n`,
  );
  for (const { file, why } of corrupt.slice(0, 5)) {
    console.warn(`    ${file}  —  ${why}`);
  }
  if (corrupt.length > 5) console.warn(`    …and ${corrupt.length - 5} more`);

  rmSync(NEXT_DIR, { recursive: true, force: true });
  console.warn(`\n  .next removed. The next compile is a cold one.\n`);
}

main();
