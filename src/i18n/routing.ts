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
