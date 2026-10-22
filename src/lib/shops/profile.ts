import { GOVERNORATES } from "@/lib/governorates";
import { SHOP_DAYS } from "@/lib/shops/format";

/**
 * What a shop owner may change about their shop, checked before it is written.
 *
 * Only the public face and the contact lines. Status, verification, owner,
 * activity and slug are not here at all — `_guard_shop_state` (0185) refuses
 * them from any route, and leaving them out means a forged body has nothing to
 * aim at. A logo or banner path must be inside the shop's own folder of the
 * `shop-media` bucket, which is where /api/pro/shops/[id]/media mints them.
 */

export type ShopProfileInput = {
  name?: unknown;
  description?: unknown;
  phone?: unknown;
  whatsapp?: unknown;
  governorate?: unknown;
  city?: unknown;
  address?: unknown;
  opening_hours?: unknown;
  logo_path?: unknown;
  banner_path?: unknown;
};

export type ShopProfilePatch = Partial<{
  name: string;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  governorate: string;
  city: string | null;
  address: string | null;
  opening_hours: Record<string, string>;
  logo_path: string | null;
  banner_path: string | null;
}>;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Tunisian number, loosely: +216 XX XXX XXX, or 8 local digits (gets +216). */
export function normalizePhone(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const digits = v.replace(/[^\d+]/g, "");
  const bare = digits.replace(/\D/g, "");
  if (bare.length === 8) return `+216${bare}`;
  if (bare.length > 8 && bare.length <= 15) return `+${bare}`;
  return undefined; // present but not a number: an error, not a silent blank
}

export function sanitizeShopProfile(
  body: ShopProfileInput,
  shopId: string,
): { patch: ShopProfilePatch; errors: string[] } {
  const patch: ShopProfilePatch = {};
  const errors: string[] = [];

  if ("name" in body) {
    const name = text(body.name, 80);
    if (!name || name.length < 2) errors.push("Le nom doit faire au moins 2 caractères.");
    else patch.name = name;
  }
  if ("description" in body) patch.description = text(body.description, 2000);
  for (const key of ["phone", "whatsapp"] as const) {
    if (!(key in body)) continue;
    const p = normalizePhone(body[key]);
    if (p === undefined) errors.push(key === "phone" ? "Numéro de téléphone invalide." : "Numéro WhatsApp invalide.");
    else patch[key] = p;
  }
  if ("governorate" in body) {
    const g = text(body.governorate, 60);
    if (!g || !(GOVERNORATES as readonly string[]).includes(g)) errors.push("Choisissez un gouvernorat.");
    else patch.governorate = g;
  }
  if ("city" in body) patch.city = text(body.city, 60);
  if ("address" in body) patch.address = text(body.address, 200);

  if ("opening_hours" in body) {
    const raw = body.opening_hours;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (const [day] of SHOP_DAYS) {
        const v = text((raw as Record<string, unknown>)[day], 60);
        if (v) out[day] = v;
      }
      patch.opening_hours = out;
    } else {
      errors.push("Horaires illisibles.");
    }
  }

  for (const key of ["logo_path", "banner_path"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") {
      patch[key] = null;
      continue;
    }
    const path = text(v, 300);
    const inFolder = path !== null
      && path.startsWith(`shops/${shopId}/`)
      && !path.includes("..")
      && /^[A-Za-z0-9/_.-]+$/.test(path);
    if (!inFolder) errors.push("Image refusée : elle n'appartient pas à cette boutique.");
    else patch[key] = path;
  }

  return { patch, errors };
}
