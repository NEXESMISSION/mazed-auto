import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // French is the default locale (fallback for unmatched Accept-Language
  // headers and bare-path redirects); Arabic is also fully supported.
  // Adding more locales later is a one-line change here.
  locales: ["ar", "fr"] as const,
  defaultLocale: "fr",
  // "always" gives every route an explicit /ar or /fr prefix. We tried
  // "as-needed" first but next-intl's `router.replace(href, { locale })`
  // always builds prefixed URLs like /ar/settings — and the middleware
  // redirect to drop the default-locale prefix didn't fire reliably,
  // producing 404s on the language switcher. Always-prefixing is also
  // closer to the user's mental model: /ar/auctions and /fr/auctions are
  // both real, bookmarkable URLs.
  localePrefix: "always",
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
