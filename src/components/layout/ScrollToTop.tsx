"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Start a NEW page at the top — and leave Back alone.
 *
 * This used to scroll to (0,0) on every pathname change without exception,
 * and said so in its own comment: "browser back/forward no longer restores
 * the previous scroll position (this overrides it)". That is the bug you hit
 * scrolling two-thirds down the catalogue, opening a car, and pressing back
 * to find yourself at the top of the list with no idea where you had been.
 * On a 66-item catalogue that means re-scrolling and re-finding your place
 * after every single listing you look at.
 *
 * The reason the override existed is also gone. It was added because
 * PullToRefresh set `will-change: transform`, which creates a containing
 * block and broke the browser's own restoration — but that declaration was
 * removed from PullToRefresh (see the comment there about `position: fixed`
 * children), so native restoration works again.
 *
 * So: forward navigations still land at the top, because arriving halfway
 * down a page you have never seen is disorienting. Back and forward keep
 * whatever position the browser remembers, because that position IS the
 * thing you pressed Back to get to.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  // `popstate` fires before the router commits the new pathname, so by the
  // time the effect below runs this flag already describes the navigation
  // that caused it.
  const restoring = useRef(false);

  useEffect(() => {
    function onPop() {
      restoring.current = true;
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (restoring.current) {
      // Back or forward: the browser is restoring a position. Consume the
      // flag and do nothing — anything we do here fights it.
      restoring.current = false;
      return;
    }
    // "instant" bypasses the global `scroll-behavior: smooth`; watching the
    // page glide to the top on every tab switch felt sluggish.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
