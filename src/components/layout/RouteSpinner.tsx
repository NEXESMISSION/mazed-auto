"use client";

// A client component on purpose: a loading fallback renders before the
// [locale] layout has set the request's locale, so next-intl on the server
// would read the request headers to find it — which turns every page under
// the layout, the cached home and info pages included, into a dynamic one.
// The client reads the words from the provider the layout already sent.
import { useTranslations } from "next-intl";

/**
 * The neutral loading fallback (a centered spinner, not a card grid, so it
 * never flashes the shape of the wrong page), re-exported as `loading.tsx` by
 * the segments that have no skeleton of their own.
 *
 * It used to be [locale]/loading.tsx, the fallback of EVERY route. That put
 * every page inside a Suspense boundary, so the response had started (status
 * 200) before a page could say notFound(): an unknown URL or a deleted annonce
 * answered 200 + noindex instead of 404. Now no boundary sits above the routes
 * that can 404 — the catch-all, the annonce page (whose [id] layout decides
 * the 404 before its own skeleton) and the storefronts.
 */
export function RouteSpinner() {
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
