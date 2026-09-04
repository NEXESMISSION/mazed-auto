"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RouteProgress } from "./RouteProgress";

/**
 * "Yes, I heard you" — for every navigation in the app.
 *
 * Every page in this product is `force-dynamic`: a click is a full server
 * render — session check, queries, HTML — and for all of it the browser sat on
 * the old page with nothing moving. The natural reading is that the tap did not
 * register, and the natural response is to tap again, which starts a second
 * render and makes it slower still.
 *
 * The admin side already solved this per-link with `useLinkStatus`, but that
 * only works inside the `<Link>` it belongs to — it cannot cover a catalogue
 * card, a nav item, and a footer link at once. This listens for the click
 * itself, in the capture phase, so it works for every internal link on the page
 * including ones rendered by server components, with nothing to remember at the
 * call site.
 *
 * It complements `loading.tsx` rather than replacing it: the skeleton appears
 * once the router commits to the new segment, while this fires on the click.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // The new route rendered — whatever we were waiting for has arrived.
  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Anything the browser will not treat as a plain in-page navigation:
      // modified clicks open a tab, and a handled event may do something else
      // entirely.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.hasAttribute("download") || (anchor.getAttribute("target") ?? "") === "_blank") {
        return;
      }

      let url: URL;
      try {
        url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      } catch {
        return;
      }
      // Another origin leaves the app; the browser shows its own progress.
      if (url.origin !== window.location.origin) return;
      // Same page, or only the query changing — the catalogue filters run their
      // own indicator for that and would otherwise double up.
      if (url.pathname === window.location.pathname) return;

      setPending(true);
    }

    // Capture, so a component calling stopPropagation on its own click handler
    // cannot hide the navigation from us.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A navigation can end without the pathname changing: a redirect back to the
  // same page, a route that throws, a link the router declines. Without this
  // the bar would sit there for the rest of the session.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // Back/forward restores a cached page without re-running the click handler.
  useEffect(() => {
    function onPop() {
      setPending(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return <RouteProgress active={pending} />;
}
