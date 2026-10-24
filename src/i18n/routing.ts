import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // French first (the default, and the only language of the admin console),
  // Arabic beside it. English was dropped — the middleware still sends /en/*
  // to French.
  locales: ["fr", "ar"] as const,
  defaultLocale: "fr",
  localePrefix: "always",
  // Arabic is chosen, never guessed. A first visit lands in French whatever
  // the browser's language; the switch writes the cookie below, and the
  // middleware sends an unprefixed URL ("/", an old link) to the language the
  // visitor picked. next-intl's own detection would also read Accept-Language,
  // which is not the same thing as a choice.
  localeDetection: false,
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type Locale = (typeof routing.locales)[number];

/** The cookie that remembers the visitor's language (next-intl's default name). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

const RTL_LOCALES: readonly string[] = ["ar"];

/**
 * Right-to-left locales. The [locale] layout puts the direction on <html>, and
 * pages are written with logical properties (ms-/ps-/start-/text-start) so they
 * mirror by themselves. See src/lib/rtl.test.ts, which keeps physical
 * left/right classes out of the folders already converted.
 */
export function localeDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/** OpenGraph's locale tag — the language as spoken in Tunisia. */
export function ogLocale(locale: string): string {
  return locale === "ar" ? "ar_TN" : "fr_TN";
}

export function stripLocalePrefix(path: string): string {
  for (const locale of routing.locales) {
    if (path === `/${locale}`) return "/";
    if (path.startsWith(`/${locale}/`)) return path.slice(locale.length + 1);
  }
  return path;
}
