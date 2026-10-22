/**
 * How a shop is presented — pure, shared by the directory, the storefront and
 * the listing page, so a shop reads the same wherever it appears.
 */

export type ShopActivity = "vente_auto" | "location_auto" | "pieces_auto";

export const ACTIVITY_LABEL: Record<ShopActivity, string> = {
  vente_auto: "Vente de véhicules",
  location_auto: "Location de véhicules",
  pieces_auto: "Pièces auto",
};

/** The `?activite=` values of the directory, readable in a URL. */
export const ACTIVITY_SLUG: Record<string, ShopActivity> = {
  vente: "vente_auto",
  location: "location_auto",
  pieces: "pieces_auto",
};

export function activityLabel(a: string | null | undefined): string {
  return ACTIVITY_LABEL[a as ShopActivity] ?? "Boutique";
}

/**
 * Two letters for a shop with no logo yet — « Auto Deal · Tunis » → « AD ».
 * The part after a « · » is the town, not the name, so it is left out.
 */
export function shopInitials(name: string): string {
  const base = name.split("·")[0] ?? name;
  const words = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/**
 * Opening hours as stored in `shops.opening_hours`: one free-text entry per
 * day — `{ "mon": "8h30 – 18h", "sun": "Fermé" }`. Returned in week order with
 * French day names; days the shop did not fill in are left out rather than
 * guessed at.
 */
export const SHOP_DAYS = [
  ["mon", "Lundi"],
  ["tue", "Mardi"],
  ["wed", "Mercredi"],
  ["thu", "Jeudi"],
  ["fri", "Vendredi"],
  ["sat", "Samedi"],
  ["sun", "Dimanche"],
] as const;

export function openingHoursRows(raw: unknown): { day: string; hours: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const o = raw as Record<string, unknown>;
  const rows: { day: string; hours: string }[] = [];
  for (const [key, label] of SHOP_DAYS) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) rows.push({ day: label, hours: v.trim().slice(0, 60) });
  }
  return rows;
}

const SCHEMA_DAY: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/**
 * The opening hours as schema.org `OpeningHoursSpecification`, for search
 * engines. Owners type hours freely (« 8h30 - 18h », « 9:00-12:00 / 14:00-18:00 »,
 * « Fermé »), so this keeps only what it can read without guessing: every
 * « HH[h:]MM - HH[h:]MM » range of a day becomes one entry; a day with none
 * (closed, « sur rendez-vous ») is left out rather than invented.
 */
export function openingHoursSpec(raw: unknown): { "@type": "OpeningHoursSpecification"; dayOfWeek: string; opens: string; closes: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: { "@type": "OpeningHoursSpecification"; dayOfWeek: string; opens: string; closes: string }[] = [];
  const time = (h: string, m: string | undefined) => {
    const hh = Number(h);
    const mm = Number(m ?? 0);
    return hh <= 24 && mm < 60 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
  };
  for (const [key] of SHOP_DAYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== "string") continue;
    for (const m of v.matchAll(/(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?\s*(?:-|–|à|a)\s*(\d{1,2})\s*(?:[h:]\s*(\d{2})?)?/gi)) {
      const opens = time(m[1], m[2]);
      const closes = time(m[3], m[4]);
      if (opens && closes && opens < closes) {
        out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${SCHEMA_DAY[key]}`, opens, closes });
      }
    }
  }
  return out;
}

/** The schema.org type a search engine should file this shop under. */
export function shopSchemaType(a: string | null | undefined): string {
  if (a === "location_auto") return "AutoRental";
  if (a === "pieces_auto") return "AutoPartsStore";
  return "AutoDealer";
}

/**
 * A URL slug from a shop's name — the same rule as the agency backfill (0190):
 * accents folded, everything else a hyphen, 3 to 50 characters. Uniqueness is
 * the caller's job; this only gives the base.
 */
export function slugifyShopName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `boutique-${base || "pro"}`.slice(0, 50);
}

/** The badge is a verification by Mazed, never a paid option (brief, recette 10). */
export function isShopVerified(s: { verification_status?: string | null }): boolean {
  return s.verification_status === "verified";
}
