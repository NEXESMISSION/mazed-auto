"use client";

import { useEffect, useRef } from "react";

interface Props {
  children: React.ReactNode;
  /** Milliseconds between auto-advances. Default 4500ms — slow enough
   *  to read each tile, fast enough that the rail clearly moves. */
  intervalMs?: number;
  /** Tailwind classes for the scroller wrapper. */
  className?: string;
}

/**
 * Auto-paginating carousel.
 *
 * - Advances by exactly one tile width every `intervalMs`.
 * - Pauses on pointer-down / mouseenter / focus-within.
 * - Centers the snapped tile (so the *next* tile is the visual focal
 *   point rather than flush-left). Scroll-padding mirrors the page's
 *   left padding so the first tile doesn't sit hard against the
 *   viewport edge.
 * - Treats the inner track as a duplicated set ([...items, ...items]).
 *   When scroll position crosses half of scrollWidth, we silently
 *   re-position back by the same amount — visually identical content
 *   so the loop reads as truly infinite.
 *
 * Consumers should render their items DOUBLED so this scroller has
 * material to wrap into. Each tile should carry `snap-center` so the
 * snap target lines up with our scroll math.
 */
export function AutoPagingScroller({
  children,
  intervalMs = 4500,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let paused = false;
    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);

    function tick() {
      if (paused || !el) return;
      const inner = el.firstElementChild as HTMLElement | null;
      const firstChild = inner?.firstElementChild as HTMLElement | null;
      if (!inner || !firstChild) return;

      const tileWidth = firstChild.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(inner).columnGap || "12") || 12;
      const step = tileWidth + gap;
      const half = el.scrollWidth / 2;

      // Always advance by one tile.
      el.scrollBy({ left: step, behavior: "smooth" });

      // Once the smooth scroll has settled, if we're past the halfway
      // point, jump back by `half`. Because the second half of the
      // track is a copy of the first half, the user sees no change in
      // content — just an apparent endless rail.
      window.setTimeout(() => {
        if (!el || half <= 0) return;
        if (el.scrollLeft >= half - 4) {
          el.scrollLeft = el.scrollLeft - half;
        }
      }, 650);
    }

    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearInterval(id);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
    };
  }, [intervalMs]);

  return (
    <div
      ref={ref}
      // scroll-padding-inline-start gives the FIRST tile a 1rem inset
      // from the viewport edge when snap aligns it — without this, the
      // tile sits flush left while every other tile is centered, which
      // reads as broken padding.
      // scroll-snap-type uses `proximity` not `mandatory` so the
      // smooth-scroll by an exact tile-width never fights the snap
      // algorithm and the user can always interrupt the auto-advance
      // mid-flight without it snapping back unpredictably.
      className={
        "overflow-x-auto hide-scrollbar scroll-smooth snap-x [scroll-snap-type:x_proximity] [scroll-padding-inline-start:1rem]" +
        (className ? " " + className : "")
      }
    >
      {children}
    </div>
  );
}
