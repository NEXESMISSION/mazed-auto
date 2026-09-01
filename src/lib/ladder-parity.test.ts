import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { minBidIncrement } from "./utils";

/**
 * SQL/TS parity guard for the money-critical ladders.
 *
 * The bid-increment ladder exists in TWO places:
 *   - TS  (src/lib/utils.ts minBidIncrement) — drives what the UI shows as
 *          the minimum next bid.
 *   - SQL (supabase/migrations/0006_security_lockdown.sql bid_increment) —
 *          the AUTHORITY enforced inside place_bid (raises
 *          below_min_increment).
 *
 * They agreed only because a human kept them in sync by hand. If a future
 * settings change edits one and not the other, the UI computes a minimum the
 * RPC rejects with a 400 (or, worse, shows a too-low figure that fails on
 * submit). This test parses the canonical SQL out of the migration and asserts
 * the TS implementation produces byte-identical results, so drift fails CI with
 * no staging DB required.
 *
 * If you intentionally change the ladder, change BOTH copies and this test will
 * pass again; if you change one, it goes red and tells you which boundary moved.
 */

const SQL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../supabase/migrations/0006_security_lockdown.sql",
);

const SQL = readFileSync(SQL_PATH, "utf8");

/**
 * Parse the `bid_increment` ladder out of the SQL source as
 * [threshold, increment] pairs plus the trailing `else` increment, e.g.
 *   when current_bid < 100000 then 1000   →  [100000, 1000]
 *   ...
 *   else 25000                            →  elseInc = 25000
 * This is the single source of truth the RPC enforces; we re-derive a JS
 * function from it and compare to the TS ladder.
 */
function parseSqlBidIncrement(): (n: number) => number {
  const fnMatch = SQL.match(
    /create or replace function public\.bid_increment[\s\S]*?\$\$([\s\S]*?)\$\$/i,
  );
  if (!fnMatch) throw new Error("bid_increment function not found in SQL");
  const body = fnMatch[1];

  const bands: Array<[number, number]> = [];
  const whenRe = /when\s+current_bid\s*<\s*(\d+)\s+then\s+(\d+)/gi;
  for (let m = whenRe.exec(body); m; m = whenRe.exec(body)) {
    bands.push([Number(m[1]), Number(m[2])]);
  }
  const elseMatch = body.match(/else\s+(\d+)\s+end/i);
  if (!elseMatch) throw new Error("bid_increment else-branch not found in SQL");
  const elseInc = Number(elseMatch[1]);

  if (bands.length === 0) throw new Error("bid_increment bands not parsed from SQL");

  return (n: number) => {
    for (const [threshold, inc] of bands) {
      if (n < threshold) return inc;
    }
    return elseInc;
  };
}

describe("bid-increment ladder: TS ↔ SQL parity", () => {
  const sqlIncrement = parseSqlBidIncrement();

  // Boundaries that matter: just-below, at, and just-above every threshold the
  // SQL declares, plus a zero and a very large value. A drift in either copy
  // changes at least one of these.
  const probes = [
    0, 1, 99_999, 100_000, 100_001, 499_999, 500_000, 500_001, 999_999,
    1_000_000, 1_000_001, 5_000_000, 50_000_000,
  ];

  for (const n of probes) {
    it(`agrees at currentBid=${n}`, () => {
      expect(minBidIncrement(n)).toBe(sqlIncrement(n));
    });
  }

  it("agrees across a randomized sweep (1000 samples)", () => {
    for (let i = 0; i < 1000; i++) {
      const n = Math.floor(Math.random() * 3_000_000);
      expect(minBidIncrement(n)).toBe(sqlIncrement(n));
    }
  });
});
