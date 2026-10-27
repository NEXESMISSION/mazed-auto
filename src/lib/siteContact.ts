import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How buyers and sellers reach the team — set in Réglages (D-B3,
 * `app_settings.site_contact`) instead of being written into the contact and
 * help pages. The defaults are what those pages said until now.
 */
export type SiteContact = { email: string; phone: string; whatsapp: string; address: string };

export const DEFAULT_SITE_CONTACT: SiteContact = {
  email: "contact@mazedauto.com",
  phone: "+216 98 120 622",
  whatsapp: "",
  address: "",
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The stored value as a full shape; an empty email or phone falls back to the defaults. */
export function readSiteContact(value: unknown): SiteContact {
  const v = (value ?? {}) as Partial<Record<keyof SiteContact, unknown>>;
  return {
    email: str(v.email, 120) || DEFAULT_SITE_CONTACT.email,
    phone: str(v.phone, 30) || DEFAULT_SITE_CONTACT.phone,
    whatsapp: str(v.whatsapp, 30),
    address: str(v.address, 200),
  };
}

const digits = (s: string) => s.replace(/\D/g, "");

/** A Tunisian number in its international form: 216 and eight digits, or nothing. */
export function tunisianDigits(raw: string): string {
  const d = digits(raw);
  if (/^[2-9]\d{7}$/.test(d)) return `216${d}`;
  if (/^216[2-9]\d{7}$/.test(d)) return d;
  return "";
}

/** « +216 98 120 622 », the way the pages print a number. */
export function formatPhone(raw: string): string {
  const d = tunisianDigits(raw);
  return d ? `+216 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : raw.trim();
}

export const telHref = (raw: string) => {
  const d = tunisianDigits(raw);
  return d ? `tel:+${d}` : null;
};
export const whatsappHref = (raw: string) => {
  const d = tunisianDigits(raw);
  return d ? `https://wa.me/${d}` : null;
};

/** What is wrong with the details typed in Réglages — empty when they can be saved. */
export function siteContactProblems(c: SiteContact): ("email" | "phone" | "whatsapp")[] {
  const out: ("email" | "phone" | "whatsapp")[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) out.push("email");
  if (!tunisianDigits(c.phone)) out.push("phone");
  if (c.whatsapp && !tunisianDigits(c.whatsapp)) out.push("whatsapp");
  return out;
}

/** Read with the service client: these keys are not in the public-read policy. */
export async function fetchSiteContact(admin: SupabaseClient | null): Promise<SiteContact> {
  if (!admin) return DEFAULT_SITE_CONTACT;
  const { data } = await admin.from("app_settings").select("value").eq("key", "site_contact").maybeSingle();
  return readSiteContact(data?.value);
}
