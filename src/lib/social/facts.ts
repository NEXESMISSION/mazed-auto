import { CONDITIONS, FUELS, TRANSMISSIONS } from "@/lib/vehicles";
import { rentalConditionRows } from "@/lib/rental";

/**
 * What a social post is allowed to say about an annonce — and nothing else.
 *
 * Brief §4, the one imperative rule: never invent characteristics, prices,
 * condition or photos. So the generators (the model and the templates) receive
 * these facts only, taken from the annonce as it was validated, and every text
 * — generated or edited — goes through `checkFacts()`: a number that is not one
 * of the annonce's own numbers is refused. A price that is not the price, a
 * year that is not the year, a mileage someone rounded down: all stopped here,
 * whoever wrote them.
 */

export type ListingKind = "vente" | "location" | "pieces";

export type ListingFacts = {
  kind: ListingKind;
  title: string;
  reference: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  mileageKm: number | null;
  fuel: string | null;
  gearbox: string | null;
  color: string | null;
  partBrand: string | null;
  condition: string | null;
  price: number | null;
  perDay: boolean;
  priceOnRequest: boolean;
  negotiable: boolean;
  governorate: string;
  city: string | null;
  rentalConditions: { label: string; value: string }[];
  shopName: string | null;
  categoryLabel: string | null;
};

export type FactsSource = {
  title: string;
  reference?: string | null;
  listing_type?: string | null;
  attributes?: Record<string, unknown> | null;
  condition?: string | null;
  price?: number | string | null;
  price_unit?: string | null;
  price_on_request?: boolean | null;
  negotiable?: boolean | null;
  governorate: string;
  city?: string | null;
  shopName?: string | null;
  categoryLabel?: string | null;
};

const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s ? s.slice(0, 80) : null;
};

export function buildFacts(src: FactsSource): ListingFacts {
  const at = src.attributes ?? {};
  const kind: ListingKind =
    src.listing_type === "pieces_auto" ? "pieces" : src.listing_type === "location_auto" || src.price_unit === "day" ? "location" : "vente";
  const km = Number(at.mileage);
  const price = src.price == null || src.price === "" ? null : Number(src.price);
  return {
    kind,
    title: src.title.trim(),
    reference: src.reference ?? null,
    make: text(at.make),
    model: text(at.model),
    year: text(at.year),
    mileageKm: Number.isFinite(km) && km > 0 ? km : null,
    fuel: FUELS.find((f) => f.value === at.fuel)?.label ?? null,
    gearbox: TRANSMISSIONS.find((t) => t.value === at.transmission)?.label ?? null,
    color: text(at.color),
    partBrand: text(at.brand),
    condition: CONDITIONS.find((c) => c.value === src.condition)?.label ?? null,
    price: price != null && Number.isFinite(price) && price > 0 && !src.price_on_request ? price : null,
    perDay: src.price_unit === "day",
    priceOnRequest: !!src.price_on_request || price == null,
    negotiable: !!src.negotiable,
    governorate: src.governorate,
    city: src.city ?? null,
    rentalConditions: kind === "location" ? rentalConditionRows(at) : [],
    shopName: src.shopName ?? null,
    categoryLabel: src.categoryLabel ?? null,
  };
}

/**
 * « 61 000 », « 61.000 », « 61000 » are one number: 61000. A separator joins
 * groups only when exactly three digits follow it, so « Golf 8 2019 » stays
 * two numbers. Arabic-Indic digits (٠-٩, ۰-۹) count like the others: a text in
 * Tunisian must not slip a number past the check by writing it that way.
 */
export function numbersIn(s: string): string[] {
  const latin = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const out: string[] = [];
  for (const m of latin.matchAll(/\d{1,3}(?:[   .]\d{3}(?!\d))+(?:,\d{1,2}(?!\d))?|\d+(?:[.,]\d{1,2}(?!\d))?/g)) {
    // The integer part only: 61 000,00 is 61000, 1.5 is 1.
    const intPart = m[0].replace(/[.,]\d{1,2}$/, "");
    out.push(String(Number(intPart.replace(/\D/g, ""))));
  }
  return out;
}

/** Every number the annonce itself gives, in every form it may be written. */
export function allowedNumbers(f: ListingFacts): Set<string> {
  const pool = [
    f.title, f.reference ?? "", f.make ?? "", f.model ?? "", f.year ?? "", f.color ?? "",
    f.partBrand ?? "", f.categoryLabel ?? "", f.shopName ?? "", f.governorate, f.city ?? "",
    ...f.rentalConditions.map((r) => r.value),
    f.price != null ? String(Math.round(f.price)) : "",
    f.mileageKm != null ? String(Math.round(f.mileageKm)) : "",
  ].join(" ");
  return new Set(numbersIn(pool));
}

/** Which numbers in `body` (and its hashtags) the annonce does not contain. */
export function checkFacts(body: string, hashtags: string[], f: ListingFacts): { ok: boolean; unknown: string[] } {
  const allowed = allowedNumbers(f);
  const unknown = [...new Set(numbersIn(`${body} ${hashtags.join(" ")}`))].filter((n) => !allowed.has(n));
  return { ok: unknown.length === 0, unknown };
}

/** The facts as the model reads them: one labelled line each, nothing empty. */
export function factsForPrompt(f: ListingFacts): string {
  const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");
  const lines: [string, string | null][] = [
    ["Type", f.kind === "vente" ? "Véhicule à vendre" : f.kind === "location" ? "Véhicule à louer" : "Pièce auto"],
    ["Titre", f.title],
    ["Catégorie", f.categoryLabel],
    ["Marque", f.make ?? f.partBrand],
    ["Modèle", f.model],
    ["Année", f.year],
    ["Kilométrage", f.mileageKm != null ? `${fmt(f.mileageKm)} km` : null],
    ["Carburant", f.fuel],
    ["Boîte", f.gearbox],
    ["Couleur", f.color],
    ["État", f.condition],
    ["Prix", f.price != null ? `${fmt(f.price)} TND${f.perDay ? " par jour" : ""}${f.negotiable ? " (négociable)" : ""}` : "Prix sur demande"],
    ["Lieu", [f.city, f.governorate].filter(Boolean).join(", ")],
    ["Vendu par", f.shopName],
    ["Référence", f.reference],
    ...f.rentalConditions.map((r) => [r.label, r.value] as [string, string]),
  ];
  return lines.filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join("\n");
}
