/**
 * Rental conditions of a `location_auto` annonce (brief, recette 3).
 *
 * Declarative on purpose: a price per day, the conditions a renter must meet,
 * and whether the vehicle is available — said by the agency, in words. There
 * is NO booking calendar: the brief forbids a fake one, and a calendar the
 * agency does not keep up to date is worse than none. Availability is
 * "disponible" or "sur demande", with a free note.
 *
 * Stored in `listings.attributes` under these keys, so no schema change and
 * the catalogue's jsonb index already covers them.
 */

export const RENTAL_KEYS = [
  "rental_deposit",
  "rental_min_age",
  "rental_license_years",
  "rental_km_per_day",
  "rental_availability",
  "rental_terms",
] as const;

export type RentalAvailability = "available" | "on_request";

export type RentalTerms = {
  rental_deposit?: number;
  rental_min_age?: number;
  rental_license_years?: number;
  rental_km_per_day?: number;
  rental_availability?: RentalAvailability;
  rental_terms?: string;
};

const whole = (v: unknown, min: number, max: number): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/**
 * Keep only well-formed rental keys from an attributes object, leaving every
 * other attribute as it was. Out-of-range numbers are dropped, not clamped:
 * a deposit of « -5 » is a typo, not a deposit of 0.
 */
export function sanitizeRentalAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!(RENTAL_KEYS as readonly string[]).includes(k)) out[k] = v;
  }
  const deposit = whole(attrs.rental_deposit, 0, 1_000_000);
  const age = whole(attrs.rental_min_age, 18, 99);
  const years = whole(attrs.rental_license_years, 0, 60);
  const km = whole(attrs.rental_km_per_day, 0, 10_000);
  if (deposit !== undefined) out.rental_deposit = deposit;
  if (age !== undefined) out.rental_min_age = age;
  if (years !== undefined) out.rental_license_years = years;
  if (km !== undefined) out.rental_km_per_day = km;
  if (attrs.rental_availability === "available" || attrs.rental_availability === "on_request") {
    out.rental_availability = attrs.rental_availability;
  }
  if (typeof attrs.rental_terms === "string" && attrs.rental_terms.trim()) {
    out.rental_terms = attrs.rental_terms.trim().slice(0, 600);
  }
  return out;
}

/** The conditions as label/value lines for the annonce page, in a fixed order. */
export function rentalConditionRows(attrs: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  const a = attrs ?? {};
  const rows: { label: string; value: string }[] = [];
  const n = (v: unknown) => (typeof v === "number" ? v : Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);
  const fmt = (v: number) => v.toLocaleString("fr-FR");

  if (a.rental_availability === "available") rows.push({ label: "Disponibilité", value: "Disponible" });
  else if (a.rental_availability === "on_request") rows.push({ label: "Disponibilité", value: "Sur demande" });
  const deposit = n(a.rental_deposit);
  if (deposit != null) rows.push({ label: "Caution", value: deposit === 0 ? "Sans caution" : `${fmt(deposit)} TND` });
  const age = n(a.rental_min_age);
  if (age != null) rows.push({ label: "Âge minimum", value: `${age} ans` });
  const years = n(a.rental_license_years);
  if (years != null) rows.push({ label: "Permis depuis", value: years === 0 ? "Aucune ancienneté exigée" : `${years} an${years > 1 ? "s" : ""}` });
  const km = n(a.rental_km_per_day);
  if (km != null) rows.push({ label: "Kilométrage inclus", value: km === 0 ? "Illimité" : `${fmt(km)} km / jour` });
  return rows;
}
