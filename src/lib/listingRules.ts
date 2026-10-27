import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The rules every annonce follows, set in Réglages (D-B5,
 * `app_settings.listing_rules`): how long it stays online once published, and
 * how many photos it may carry. They used to be constants in four routes and
 * a product's duration that happened to be picked first — the « 30 jours » of
 * a parts product applied to cars too.
 *
 * A payment that bought a given duration (a legacy publication fee) keeps it;
 * everything else reads these.
 */
export type ListingRules = { validityDays: number; maxPhotos: number };

export const DEFAULT_LISTING_RULES: ListingRules = { validityDays: 30, maxPhotos: 12 };

/** A week to six months online; one to twenty-four photos. */
export const LISTING_RULES_BOUNDS = {
  validityDays: { min: 7, max: 180 },
  maxPhotos: { min: 1, max: 24 },
} as const;

const clamp = (v: unknown, fallback: number, { min, max }: { min: number; max: number }) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** The stored value as a full shape; a missing or broken one reads as the defaults. */
export function readListingRules(value: unknown): ListingRules {
  const v = (value ?? {}) as { validity_days?: unknown; max_photos?: unknown };
  return {
    validityDays: v.validity_days == null
      ? DEFAULT_LISTING_RULES.validityDays
      : clamp(v.validity_days, DEFAULT_LISTING_RULES.validityDays, LISTING_RULES_BOUNDS.validityDays),
    maxPhotos: v.max_photos == null
      ? DEFAULT_LISTING_RULES.maxPhotos
      : clamp(v.max_photos, DEFAULT_LISTING_RULES.maxPhotos, LISTING_RULES_BOUNDS.maxPhotos),
  };
}

/** As stored in `app_settings.listing_rules`. */
export function toStoredListingRules(r: ListingRules) {
  return { validity_days: r.validityDays, max_photos: r.maxPhotos };
}

/** Read with the service client (not in the public-read policy); none → the defaults. */
export async function fetchListingRules(admin: SupabaseClient | null): Promise<ListingRules> {
  if (!admin) return DEFAULT_LISTING_RULES;
  const { data } = await admin.from("app_settings").select("value").eq("key", "listing_rules").maybeSingle();
  return readListingRules(data?.value);
}

/**
 * The static pages that print these rules or the site's contact details
 * (« 30 jours », the phone number): saving them in Réglages regenerates these.
 */
export const PAGES_SHOWING_SETTINGS = ["/[locale]/contact", "/[locale]/help", "/[locale]/how-it-works"] as const;
