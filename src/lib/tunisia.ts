/**
 * Shared Tunisia-domain constants. Pulled out of SellForm so signup,
 * login, search filters, and explore all agree on the same canonical
 * list of 24 gouvernorats (and aren't fighting over typos like
 * "Médenine" vs "Medenine").
 */

export const TUNISIAN_GOVERNORATES = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Nabeul",
  "Sfax",
  "Bizerte",
  "Gabès",
  "Médenine",
  "Kairouan",
  "Béja",
  "Jendouba",
  "Kef",
  "Kasserine",
  "Sidi Bouzid",
  "Gafsa",
  "Tozeur",
  "Kebili",
  "Tataouine",
  "Siliana",
  "Zaghouan",
] as const;

export type TunisianGovernorate = (typeof TUNISIAN_GOVERNORATES)[number];

/**
 * Dial codes for the phone field. Tunisia leads (the platform's
 * primary market), then the diaspora destinations (France, Italy,
 * Germany, Belgium, Switzerland, UAE, Canada, USA, etc.) so an
 * expat investor can sign up with their actual phone number.
 *
 * The list is intentionally short — there's no point shipping a
 * 200-country dropdown for an audience that's overwhelmingly
 * Tunisia-resident or Tunisia-diaspora.
 *
 * The country names are in the messages, under `phone.countries.<code
 * digits>` ("216" → Tunisie / تونس).
 */
export const DIAL_CODES: { code: string }[] = [
  { code: "+216" },
  { code: "+33" },
  { code: "+39" },
  { code: "+49" },
  { code: "+32" },
  { code: "+41" },
  { code: "+34" },
  { code: "+31" },
  { code: "+44" },
  { code: "+1" },
  { code: "+971" },
  { code: "+966" },
  { code: "+974" },
  { code: "+965" },
  { code: "+973" },
  { code: "+968" },
  { code: "+961" },
  { code: "+962" },
  { code: "+20" },
  { code: "+212" },
  { code: "+213" },
  { code: "+90" },
];

/**
 * Normalize a (dialCode, raw number) pair to E.164.
 *   - Strips spaces, dashes, parens.
 *   - Trims one or more leading zeros that callers often type before
 *     the local number (e.g. "08 1234 567" instead of "8 1234 567").
 *   - Returns null when the result doesn't look like a plausible
 *     phone (under 6 digits after the dial code, or non-numeric).
 *
 * Tunisia (+216) gets an extra constraint: the local part must be
 * exactly 8 digits — that's the only valid mobile format and
 * accepting anything else just lets typos through to SMS providers
 * who will reject them on send.
 */
export function normalizeE164(
  dialCode: string,
  rawNumber: string,
): string | null {
  const digits = rawNumber.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (dialCode === "+216") {
    if (digits.length !== 8) return null;
  } else if (digits.length < 6 || digits.length > 15) {
    return null;
  }
  return `${dialCode}${digits}`;
}

/** What is wrong with a typed phone number — a key under `phone.errors`. */
export type PhoneProblem = "empty" | "tunisianLength" | "tooShort" | "tooLong";

/**
 * Phone validator that says what is wrong, for surfacing in the
 * signup/login forms. Mirrors normalizeE164's rules but returns a
 * reason instead of just null. The reason is a message key; the form
 * words it in the reader's language with `digits` and the dial code
 * ("vous en avez tapé 6").
 *
 *   "+216" → exactly 8 digits required
 *   other  → 6–15 digits required (E.164 spec)
 *
 * Used by the forms before normalizeE164. The forms still call
 * normalizeE164 after validatePhone succeeds, so a downstream change
 * to either function doesn't break the other.
 */
export function validatePhone(
  dialCode: string,
  rawNumber: string,
): { ok: true } | { ok: false; reason: PhoneProblem; digits: number } {
  const digits = rawNumber.replace(/\D/g, "").replace(/^0+/, "");
  const fail = (reason: PhoneProblem) => ({ ok: false as const, reason, digits: digits.length });
  if (!digits) return fail("empty");
  if (dialCode === "+216") {
    return digits.length === 8 ? { ok: true } : fail("tunisianLength");
  }
  if (digits.length < 6) return fail("tooShort");
  if (digits.length > 15) return fail("tooLong");
  return { ok: true };
}

/**
 * Split an E.164 number back into the (dialCode, local) pair our
 * UI expects. Used by the login form when prefilling from a saved
 * preference, and by the profile page when rendering the value the
 * user originally entered.
 *
 * Falls back to (default, original) when no known dial code matches,
 * so the function is safe on garbage / legacy values.
 */
export function splitE164(
  e164: string,
  defaultCode = "+216",
): { dialCode: string; number: string } {
  for (const c of DIAL_CODES) {
    if (e164.startsWith(c.code)) {
      return { dialCode: c.code, number: e164.slice(c.code.length) };
    }
  }
  return { dialCode: defaultCode, number: e164.replace(/^\+/, "") };
}
