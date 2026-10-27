/**
 * The catalogue's two ranges — budget and year — read the same way by the
 * filter panel and by the query.
 *
 * A minimum above its maximum is a typo, never a search: applied as typed it
 * returns nothing, and « no results » then reads as « nothing for sale »
 * instead of « look at what you typed ». The panel holds such a range back
 * and says so next to the fields; the query, for a link that carries one
 * anyway, reads it the right way round.
 */

export type RangeProblem = "price" | "year";

type Ranges = { min: string; max: string; year_min: string; year_max: string };

const amount = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : null);
/** A year only counts once it has its four digits: « 20 » is a year being typed. */
const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v) : null);

export function rangeProblems(f: Ranges): RangeProblem[] {
  const out: RangeProblem[] = [];
  const [pMin, pMax] = [amount(f.min), amount(f.max)];
  if (pMin != null && pMax != null && pMax > 0 && pMin > pMax) out.push("price");
  const [yMin, yMax] = [year(f.year_min), year(f.year_max)];
  if (yMin != null && yMax != null && yMin > yMax) out.push("year");
  return out;
}

/** Two bounds, low first. Either may be missing. */
export function ordered(lo: number | null, hi: number | null): [number | null, number | null] {
  return lo != null && hi != null && lo > hi ? [hi, lo] : [lo, hi];
}
