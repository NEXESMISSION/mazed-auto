"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** The flex track + cards. Pass exactly the inner content; the wrapper
   *  handles overflow and the scroll buttons. */
  children: React.ReactNode;
  /** Tailwind classes applied to the inner flex track. Defaults to the
   *  rail standard `flex gap-3 px-4 pb-1`. Override per rail if needed. */
  trackClassName?: string;
}

/**
 * Horizontal scroller with left/right arrow buttons that fade in on
 * mouse-over (lg+ only). Mobile keeps native touch-scroll — the arrows
 * are completely invisible below lg, so the existing mobile UX is
 * untouched.
 *
 * The buttons auto-disable when the user reaches each end. The scroll
 * step is 75% of the visible viewport, which moves whole rows of cards
 * in one click without overshooting.
 */
export function ScrollableRow({
  children,
  trackClassName = "flex gap-3 px-4 pb-1",
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Probe scroll position so the arrow buttons disable at the ends.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      // Math.ceil to swallow sub-pixel rounding; otherwise canRight stays
      // true on a fully-scrolled track.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanLeft(el.scrollLeft > 4);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanRight(
        Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4,
      );
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  function nudge(dir: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  }

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="overflow-x-auto hide-scrollbar scroll-smooth"
      >
        <div className={trackClassName}>{children}</div>
      </div>

      {/* Left arrow — only on lg+, only when there's something to scroll
          back to. Click handler doesn't bubble to underlying cards. */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Précédent"
        tabIndex={canLeft ? 0 : -1}
        className={`hidden lg:flex absolute start-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-black/75 backdrop-blur-md border border-[var(--border-strong)] text-white items-center justify-center shadow-lg transition-all hover:bg-black/90 hover:border-[var(--gold)] hover:text-[var(--gold)] active:scale-95 ${
          canLeft
            ? "opacity-0 group-hover:opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Suivant"
        tabIndex={canRight ? 0 : -1}
        className={`hidden lg:flex absolute end-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-black/75 backdrop-blur-md border border-[var(--border-strong)] text-white items-center justify-center shadow-lg transition-all hover:bg-black/90 hover:border-[var(--gold)] hover:text-[var(--gold)] active:scale-95 ${
          canRight
            ? "opacity-0 group-hover:opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
