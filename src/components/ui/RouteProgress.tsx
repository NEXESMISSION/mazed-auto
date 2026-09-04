"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The bar at the very top of the window that says "something is loading".
 *
 * Filtering the catalogue is a server round trip — ~0.5 s on a good connection,
 * more on 3G. The only feedback was a 14px spinner next to the result count,
 * which is below the fold on mobile the moment you scroll into the results: you
 * tapped a marque, nothing moved, so you tapped again. This is deliberately the
 * loudest, most boring convention on the web, and it is fixed to the viewport
 * so it is visible no matter where you are on the page.
 *
 * It portals to <body> because the filter rail sits inside transformed,
 * overflow-hidden containers that would otherwise clip a `fixed` child.
 */
export function RouteProgress({ active }: { active: boolean }) {
  const [mounted, setMounted] = useState(false);
  // Keep the bar alive briefly after `active` drops so it can animate out to
  // 100% instead of vanishing mid-stripe, which reads as a cancelled load.
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 240);
    return () => clearTimeout(t);
  }, [active, visible]);

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      aria-hidden
      // Above the alert layer (200): a progress hint must never be the thing
      // hidden behind a dialog.
      className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[3px] overflow-hidden"
    >
      <div
        className={
          active
            ? "h-full w-full origin-left animate-[route-progress_1.4s_cubic-bezier(.2,.8,.2,1)_forwards] bg-[linear-gradient(90deg,transparent,var(--gold),#fff5d0)]"
            : "h-full w-full origin-left scale-x-100 bg-[linear-gradient(90deg,transparent,var(--gold),#fff5d0)] transition-opacity duration-200 opacity-0"
        }
      />
    </div>,
    document.body,
  );
}

/**
 * Marks the document while a filter transition is in flight so server-rendered
 * results elsewhere on the page can dim (see `[data-filtering]` in globals.css).
 *
 * Counted, because the filter rail and the toolbar each run their own copy of
 * the hook — without the count, whichever one settled first would clear the
 * flag while the other was still loading.
 */
let inFlight = 0;

export function useFilteringFlag(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    inFlight += 1;
    document.documentElement.dataset.filtering = "1";
    return () => {
      inFlight = Math.max(0, inFlight - 1);
      if (inFlight === 0) delete document.documentElement.dataset.filtering;
    };
  }, [pending]);
}
