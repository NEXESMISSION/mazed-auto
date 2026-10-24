"use client";

// A client component on purpose: a loading fallback renders before the
// [locale] layout has set the request's locale, so next-intl on the server
// would read the request headers to find it — which turns every page under
// the layout, the cached home and info pages included, into a dynamic one.
// The client reads the words from the provider the layout already sent.
import { useTranslations } from "next-intl";

/**
 * Locale-root loading fallback — fires only for route segments that don't
 * ship their own loading.tsx. Deliberately NEUTRAL (a centered brand spinner,
 * not a property-card grid) so it never flashes the shape of the wrong page
 * during navigation. Routes with a meaningful skeleton (home, properties,
 * auction detail, account, auth) define their own loading.tsx.
 */
export default function LocaleLoading() {
  const t = useTranslations("common");
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full items-center justify-center px-6"
    >
      <span className="inline-flex size-10 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--gold)]" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
