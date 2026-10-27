/**
 * A car's mileage, as the seller types it: whole kilometres, from 0 to
 * 2 000 000. The form flags anything else and the draft route drops it, so a
 * negative or absurd figure never reaches a listing — it used to be stored as
 * typed, and the catalogue's « ≤ km » filter counted a car at -5 000 km as
 * nearly new.
 */
export const MAX_MILEAGE = 2_000_000;

/** True when empty (the field is optional) or a whole number in range. */
export function mileageOk(v: unknown): boolean {
  if (v == null || v === "") return true;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return false;
  return Number(s) <= MAX_MILEAGE;
}

/** The attributes without a mileage that fails `mileageOk`. */
export function withoutBadMileage<T extends Record<string, unknown>>(attrs: T): T {
  if (!("mileage" in attrs) || mileageOk(attrs.mileage)) return attrs;
  const rest = { ...attrs };
  delete rest.mileage;
  return rest;
}
