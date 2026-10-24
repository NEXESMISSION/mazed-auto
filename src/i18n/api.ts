import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { LOCALE_COOKIE, routing, type Locale } from "./routing";

/**
 * The language of the page that called an API route. Route handlers live
 * outside /[locale], so they read it from the page's URL in the Referer (the
 * site sends `strict-origin-when-cross-origin`, so a same-origin fetch carries
 * the full path), then from the language cookie, then fall back to French.
 */
export function localeFromRequest(req: Request): Locale {
  return localeFromHeaders(req.headers);
}

/**
 * The same, for code deep inside a route handler that has no `req` at hand
 * (a shared guard): Next exposes the current request's headers.
 */
export async function currentRequestLocale(): Promise<Locale> {
  try {
    return localeFromHeaders(await headers());
  } catch {
    return routing.defaultLocale; // outside a request (tests, scripts)
  }
}

function localeFromHeaders(h: Headers): Locale {
  const referer = h.get("referer");
  if (referer) {
    try {
      const segment = new URL(referer).pathname.split("/")[1];
      if (hasLocale(routing.locales, segment)) return segment;
    } catch {
      // not a URL — fall through
    }
  }
  const cookie = h.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1];
  if (hasLocale(routing.locales, cookie)) return cookie;
  return routing.defaultLocale;
}

/** `t` for an API route's messages, in the calling page's language. */
export function apiTranslations(req: Request, namespace: string) {
  return getTranslations({ locale: localeFromRequest(req), namespace });
}
