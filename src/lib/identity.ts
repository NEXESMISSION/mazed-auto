/**
 * Accounts here are created from a phone number. Supabase needs an email, so
 * signup mints a synthetic one — `21658415520@phone.mazedauto.app`. It is
 * plumbing: nobody owns that mailbox, nothing is ever delivered to it, and the
 * user never typed it.
 *
 * Showing it back to them (as we did on the account screen and in settings,
 * labelled "Adresse e-mail", described as their login identifier) is worse
 * than useless — it invites them to try signing in with it, or to "correct"
 * it. The phone is the identity; these helpers keep the synthetic address out
 * of the interface.
 */

const SYNTHETIC_DOMAINS = ["@phone.mazedauto.app", "@phone.mazed.tn"];

/** True for a placeholder address minted from a phone number. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return SYNTHETIC_DOMAINS.some((d) => e.endsWith(d));
}

/** A real, user-supplied email — or null when it is only plumbing. */
export function realEmail(email: string | null | undefined): string | null {
  if (!email || isSyntheticEmail(email)) return null;
  return email;
}

/** `+21658415520` → `58 415 520`, the way a Tunisian number is read aloud. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("216") ? digits.slice(3) : digits;
  if (local.length !== 8) return phone;
  return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

/**
 * What to print under someone's name: their phone, or a real email if they
 * have one. Never the synthetic address.
 */
export function accountLabel(
  email: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  return formatPhone(phone) ?? realEmail(email);
}

/**
 * The same question, when a synthetic address is all you have.
 *
 * The admin journal stores `user_email` and nothing else, so every row about a
 * phone-signup account read `21658415520@phone.mazedauto.app` — the exact
 * string the rest of the interface goes out of its way never to show. The
 * local part of a synthetic address IS the phone number, so it can be
 * recovered and formatted rather than printed raw.
 */
export function accountLabelFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  if (!isSyntheticEmail(email)) return email;
  return formatPhone(email.split("@")[0]);
}
