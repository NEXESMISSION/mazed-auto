"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** Inner content — a flex row of tiles. The component duplicates the
   *  caller's items behind the scenes via `data-duplicate-track` so the
   *  loop reads as endless without each consumer having to render twice. */
  children: React.ReactNode;
  /** Auto-advance interval in milliseconds. Default 3500ms. */
  intervalMs?: number;
  /** Tailwind classes applied to the inner flex track wrapper. */
  trackClassName?: string;
  /** ARIA label for the wrapper region. */
  ariaLabel?: string;
}

/**
 * Desktop-only horizontal slider with always-visible navigation arrows
 * and gentle auto-advance. Used as the desktop replacement for the home
 * page's CSS marquee sections (NewestRibbon, LiveActivityTicker) so the
 * user can step through items at their own pace. Auto-advance pauses
 * while the user is hovering, focused inside, or has interrupted via an
 * arrow click.
 *
 * The track is the consumer's flex row — caller renders tiles inside,
 * we wrap it with overflow handling and arrows. To make the loop feel
 * endless, the caller should pass items already duplicated once
 * ([...items, ...items]); the auto-advance teleports back when scroll
 * crosses half the track width — same trick as AutoPagingScroller.
 */
export function DesktopArrowSlider({
  children,
  intervalMs = 3500,
  trackClassName = "flex gap-5 px-6 pb-1",
  ariaLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const userInterruptedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pause = () => {
      pausedRef.current = true;
    };
    const resume = () => {
      pausedRef.current = false;
    };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });

    function tick() {
      if (pausedRef.current || userInterruptedRef.current || !el) return;
      const inner = el.firstElementChild as HTMLElement | null;
      const firstChild = inner?.firstElementChild as HTMLElement | null;
      if (!inner || !firstChild) return;

      const tileWidth = firstChild.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(inner).columnGap || "20") || 20;
      const step = tileWidth + gap;
      const half = el.scrollWidth / 2;

      el.scrollBy({ left: step, behavior: "smooth" });

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
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
    };
  }, [intervalMs]);

  function nudge(dir: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    // Once the user takes manual control, stop auto-advancing — they're
    // browsing intentionally. Hover-pause covers the transient case.
    userInterruptedRef.current = true;
    const step = el.clientWidth * 0.7;
    const half = el.scrollWidth / 2;

    if (dir === -1 && el.scrollLeft <= 4 && half > 0) {
      // At the start, going back: teleport forward to the duplicate so
      // there's still material to scroll back through.
      el.scrollLeft = half;
    }
    el.scrollBy({ left: dir * step, behavior: "smooth" });

    window.setTimeout(() => {
      if (!el || half <= 0) return;
      if (el.scrollLeft >= half - 4) {
        el.scrollLeft = el.scrollLeft - half;
      }
    }, 650);
  }

  return (
    <div className="relative" aria-label={ariaLabel}>
      <div
        ref={scrollRef}
        className="overflow-x-auto hide-scrollbar scroll-smooth"
      >
        <div className={trackClassName}>{children}</div>
      </div>

      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Précédent"
        className="absolute start-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/75 backdrop-blur-md ring-1 ring-white/10 text-white flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] transition-all hover:bg-[var(--gold)] hover:text-black hover:ring-[var(--gold)] active:scale-95"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Suivant"
        className="absolute end-3 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/75 backdrop-blur-md ring-1 ring-white/10 text-white flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] transition-all hover:bg-[var(--gold)] hover:text-black hover:ring-[var(--gold)] active:scale-95"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
