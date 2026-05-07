"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets the page scroll to the top whenever the route changes. Without
 * this, navigating from a long /auctions list (scrolled halfway down) to
 * /auctions/[id] would land mid-page, hiding the header and title.
 *
 * Uses next/navigation's usePathname (NOT the locale-aware @/i18n one) so
 * locale switches like /ar/settings → /fr/settings also trigger the
 * scroll — the locale-aware version returns the unprefixed path and
 * wouldn't change in that case.
 *
 * Body is the page's only scroll container (verified — overflow-y-auto
 * usages are scoped to drawers, modals, chat, and admin sidebar, none
 * of which scroll the page itself), so a single window.scrollTo
 * suffices.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    // `behavior: "instant"` skips smooth-scroll animation — a 300ms
    // smooth-scroll on every nav feels laggy on mobile.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
