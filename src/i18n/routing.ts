import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Arabic is primary per PLAN §26; French is secondary. Adding more locales
  // later is a one-line change here.
  locales: ["ar", "fr"] as const,
  defaultLocale: "ar",
  // "as-needed" keeps Arabic URLs prefix-free (`/auctions` shows Arabic) and
  // prefixes only French (`/fr/auctions`). Cleaner than `/ar/auctions` for
  // the primary audience and avoids a 308 on every root visit.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
