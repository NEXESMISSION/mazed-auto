import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // French is the default locale (fallback for unmatched Accept-Language
  // headers and bare-path redirects); Arabic is also fully supported.
  // Adding more locales later is a one-line change here.
  locales: ["ar", "fr"] as const,
  defaultLocale: "fr",
  localePrefix: "always",
  // Persist the user's locale choice for a year and on every path so a
  // close + reopen lands them back on the language they picked. Without
  // this, the cookie still defaults to ~1y but we make it explicit so a
  // future framework upgrade doesn't quietly shorten it.
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type Locale = (typeof routing.locales)[number];

/**
 * Strip a leading `/ar/` or `/fr/` (or bare `/ar` / `/fr`) from a path so
 * it can be safely fed to the locale-aware router, which always prepends
 * the active locale itself. Without this, `router.push("/fr/profile")`
 * produces `/fr/fr/profile` (double-prefix → 404).
 *
 * Idempotent on already-stripped paths.
 */
export function stripLocalePrefix(path: string): string {
  for (const locale of routing.locales) {
    if (path === `/${locale}`) return "/";
    if (path.startsWith(`/${locale}/`)) return path.slice(locale.length + 1);
  }
  return path;
}
