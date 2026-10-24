import type { Metadata } from "next";
import { routing } from "./routing";

/**
 * Canonical + hreflang for a page worth indexing, `path` being its path
 * without the locale ("/" for the home page, "/annonces/<id>"…). Relative
 * URLs: the root layout's `metadataBase` makes them absolute.
 *
 * x-default is the unprefixed path, which the middleware sends to the
 * visitor's chosen language (French when none) — the same value as the
 * hreflang Link header next-intl's middleware puts on every response, so the
 * two never disagree.
 */
export function localeAlternates(locale: string, path: string): NonNullable<Metadata["alternates"]> {
  const suffix = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}${suffix}`])),
      "x-default": path,
    },
  };
}
