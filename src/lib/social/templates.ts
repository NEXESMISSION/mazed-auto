import type { ListingFacts } from "./facts";
import type { SocialNetwork } from "./utm";

/**
 * Posts written from a template — the facts in a fixed shape. Used when no
 * model is configured, when the shop's plan does not include AI (D-S7), and
 * as the fallback when a generated text fails `checkFacts()`. Nothing here can
 * invent: every value comes from the facts, and a missing fact is a missing
 * line.
 *
 * Languages (D-S5): French, or Tunisian written in Arabic script.
 */

export type Language = "fr" | "tn";
export type Draft = { body: string; hashtags: string[] };

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");

/** #Tag from a fact: letters and digits only, nothing if nothing is left. */
function tag(s: string | null): string | null {
  if (!s) return null;
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  return t.length >= 2 ? `#${t}` : null;
}

export function hashtagsFor(f: ListingFacts): string[] {
  const base = f.kind === "location" ? "#LocationVoiture" : f.kind === "pieces" ? "#PiecesAuto" : f.condition === "Neuf" ? "#VoitureNeuve" : "#VoitureOccasion";
  return [...new Set(["#MazedAuto", base, "#Tunisie", tag(f.make ?? f.partBrand), tag(f.model), tag(f.governorate)].filter((x): x is string => !!x))];
}

function priceLine(f: ListingFacts, lang: Language): string {
  if (f.price == null) return lang === "tn" ? "السوم: كلّمنا" : "Prix sur demande";
  const p = `${fmt(f.price)} DT${f.perDay ? (lang === "tn" ? " في النهار" : " / jour") : ""}`;
  if (lang === "tn") return `السوم: ${p}${f.negotiable ? " (قابل للنقاش)" : ""}`;
  return `Prix : ${p}${f.negotiable ? " (négociable)" : ""}`;
}

function specs(f: ListingFacts, lang: Language): string[] {
  const out: string[] = [];
  if (f.kind === "pieces") {
    if (f.partBrand) out.push(lang === "tn" ? `الماركة: ${f.partBrand}` : `Marque : ${f.partBrand}`);
    if (f.condition) out.push(lang === "tn" ? `الحالة: ${f.condition}` : `État : ${f.condition}`);
    return out;
  }
  const car = [f.make, f.model, f.year].filter(Boolean).join(" ");
  if (car) out.push(car);
  if (f.mileageKm != null) out.push(`${fmt(f.mileageKm)} km`);
  if (f.fuel) out.push(f.fuel);
  if (f.gearbox) out.push(lang === "tn" ? `بواط ${f.gearbox}` : `Boîte ${f.gearbox.toLowerCase()}`);
  if (f.color) out.push(f.color);
  return out;
}

export function templateDraft(f: ListingFacts, network: SocialNetwork, lang: Language): Draft {
  const place = [f.city, f.governorate].filter(Boolean).join(", ");
  const lines: string[] = [];
  if (lang === "tn") {
    const head = f.kind === "location" ? "🚗 للكراء" : f.kind === "pieces" ? "🔧 قطعة غيار" : "🚗 للبيع";
    lines.push(`${head}: ${f.title}`);
    const s = specs(f, lang);
    if (s.length) lines.push(s.join(" · "));
    for (const r of f.rentalConditions) lines.push(`${r.label}: ${r.value}`);
    lines.push(priceLine(f, lang));
    lines.push(`📍 ${place}`);
    if (f.shopName) lines.push(`🏪 ${f.shopName}`);
    lines.push(network === "instagram"
      ? `التفاصيل على Mazed Auto${f.reference ? `، المرجع ${f.reference}` : ""}`
      : "التفاصيل والتواصل على Mazed Auto 👇");
  } else {
    const head = f.kind === "location" ? "🚗 À louer" : f.kind === "pieces" ? "🔧 Pièce auto" : "🚗 À vendre";
    lines.push(`${head} : ${f.title}`);
    const s = specs(f, lang);
    if (s.length) lines.push(s.join(" · "));
    for (const r of f.rentalConditions) lines.push(`${r.label} : ${r.value}`);
    lines.push(priceLine(f, lang));
    lines.push(`📍 ${place}`);
    if (f.shopName) lines.push(`🏪 ${f.shopName}`);
    lines.push(network === "instagram"
      ? `Détails sur Mazed Auto${f.reference ? `, réf. ${f.reference}` : ""}`
      : "Détails et contact sur Mazed Auto 👇");
  }
  return { body: lines.join("\n"), hashtags: network === "instagram" ? hashtagsFor(f) : hashtagsFor(f).slice(0, 3) };
}

/** What is actually sent: the text, the link where a link works, the tags. */
export function finalText(network: SocialNetwork, body: string, hashtags: string[], link: string): string {
  const tags = hashtags.join(" ");
  // A link in an Instagram caption is not clickable; the reference in the text
  // is how a reader finds the annonce. Facebook gets the tagged link.
  return network === "facebook" ? `${body}\n${link}${tags ? `\n\n${tags}` : ""}` : `${body}${tags ? `\n\n${tags}` : ""}`;
}
