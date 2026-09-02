/**
 * "Des plaquettes pour ma Clio 5 de 2020."
 *
 * The one query a parts marketplace lives on, and the reason `listing_fitments`
 * is a table rather than a jsonb blob. This module holds the matching rule so
 * the catalog page and any future surface (a saved search, a "pièces pour votre
 * voiture" rail on the account page) agree on what "compatible" means.
 *
 * The rule is deliberately forgiving on the fields a seller types by hand and
 * strict on the one that is unambiguous:
 *   • make  — exact, case- and accent-insensitive. "renault" is Renault.
 *   • model — substring, because sellers write "Clio 5", "Clio V", "Clio 5
 *             Business" for the same car and a buyer types the shortest form.
 *   • year  — must fall inside the range. An open end means "and later" /
 *             "and earlier", which is how a parts catalog is actually written.
 */

export type Fitment = {
  make: string;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
};

export type FitmentQuery = {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
};

/** Lower-case, strip accents and collapse whitespace/punctuation. */
export function normalizeFitmentText(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toYear(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1950 && n <= 2100 ? n : null;
}

/** Does this fitment row cover the vehicle the buyer described? */
export function fitmentMatches(f: Fitment, q: FitmentQuery): boolean {
  const make = q.make ? normalizeFitmentText(q.make) : "";
  if (make && normalizeFitmentText(f.make) !== make) return false;

  const model = q.model ? normalizeFitmentText(q.model) : "";
  if (model) {
    const rowModel = normalizeFitmentText(f.model ?? "");
    // Either direction: the seller may be more specific than the buyer
    // ("Clio 5 Business" vs "Clio 5") or the other way round.
    if (!rowModel.includes(model) && !model.includes(rowModel)) return false;
    if (!rowModel) return false;
  }

  const year = toYear(q.year);
  if (year != null) {
    const from = f.yearFrom ?? Number.NEGATIVE_INFINITY;
    const to = f.yearTo ?? Number.POSITIVE_INFINITY;
    if (year < from || year > to) return false;
  }

  return true;
}

/** The listing ids whose fitments cover the query. */
export function listingIdsMatching(
  rows: (Fitment & { listingId: string })[],
  q: FitmentQuery,
): string[] {
  const ids = new Set<string>();
  for (const r of rows) if (fitmentMatches(r, q)) ids.add(r.listingId);
  return [...ids];
}
