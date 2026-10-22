import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // French only. ar/en were dropped — Tunisian francophone market.
  locales: ["fr"] as const,
  defaultLocale: "fr",
  localePrefix: "always",
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type Locale = (typeof routing.locales)[number];

/**
 * Right-to-left locales. None is enabled today (French only), but the layout
 * already derives `dir` from the locale, and the shop pages are written with
 * logical properties (ms-/ps-/start-/text-start) — so turning Arabic on is a
 * matter of translations, not of re-laying out pages. See
 * src/lib/rtl.test.ts, which keeps physical left/right classes out of them.
 */
const RTL_LOCALES: readonly string[] = ["ar"];

export function localeDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export function stripLocalePrefix(path: string): string {
  for (const locale of routing.locales) {
    if (path === `/${locale}`) return "/";
    if (path.startsWith(`/${locale}/`)) return path.slice(locale.length + 1);
  }
  return path;
}
