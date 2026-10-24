"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The "À la une" cover, as a slider.
 *
 * The home page had twelve curated annonces and showed exactly one of them —
 * whichever the admin ranked first. Every other placement was invisible until
 * somebody reordered the list by hand, which makes "à la une" a queue of one.
 *
 * Built on native scroll-snap rather than a transform track, because on a phone
 * the gesture has to be the browser's: momentum, rubber-banding and the
 * interrupt-mid-fling all come free, and none of them are worth reimplementing
 * in JavaScript. The buttons and dots simply scroll the same container, so
 * touch and pointer drive one mechanism instead of two that can disagree.
 *
 * The slides are rendered on the SERVER and passed in as children — this
 * component only moves them. That keeps the photographs, prices and links out
 * of the client bundle. Its few words come the same way, already translated,
 * so the home page needs no messages in the browser.
 *
 * In Arabic the track runs right to left, and the browser counts its
 * scrollLeft from 0 down to negative values: positions are read as absolute
 * values and written back with the direction's sign.
 */
export type CarouselLabels = {
  region: string;
  roleDescription: string;
  prev: string;
  next: string;
  /** « Aller à l'annonce n sur N », one per slide. */
  goTo: string[];
};

export function FeaturedCarousel({
  children,
  /** Milliseconds between automatic advances. 0 disables autoplay. */
  interval = 6000,
  className = "",
  labels,
}: {
  children: React.ReactNode;
  interval?: number;
  className?: string;
  labels: CarouselLabels;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const goToRef = useRef<(i: number) => void>(() => {});
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  // Hovering pauses; the carousel resumes when the pointer leaves.
  const [paused, setPaused] = useState(false);
  // Pressing a dot or an arrow is different: it hands control over for good.
  // Without this, autoplay kept firing during the smooth scroll a tap had
  // started and stole the slide mid-flight — pressing dot 4 landed on 3.
  // Hover-pause cannot cover it, because a tap fires no pointerenter.
  const [tookOver, setTookOver] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    setCount(el.children.length);
  }, [children]);

  /** Which slide is under the scroll position — derived, never assumed. */
  const syncIndex = useCallback(() => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncIndex);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [syncIndex]);

  /** Explicit navigation from a control: stop the automatic advance. */
  const takeOver = useCallback((i: number) => {
    setTookOver(true);
    goToRef.current(i);
  }, []);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = el.children.length;
    if (n === 0) return;
    const target = ((i % n) + n) % n; // wraps both ways
    const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollTo({
      left: sign * target * el.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  // Autoplay. Skipped entirely for one slide, for a paused carousel, for a
  // hidden tab (a slideshow nobody can see is wasted battery), and for anyone
  // who asked their system for less motion.
  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  useEffect(() => {
    if (!interval || paused || tookOver || count < 2) return;
    if (typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      goTo(index + 1);
    }, interval);
    return () => window.clearInterval(id);
  }, [interval, paused, tookOver, count, index, goTo]);

  const single = count < 2;

  return (
    <div
      className={`relative ${className}`}
      role="region"
      aria-roledescription={labels.roleDescription}
      aria-label={labels.region}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      // A touch is a deliberate interaction: stop advancing and do not resume,
      // so the slide someone swiped to stays put while they read it.
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={track}
        // `snap-x mandatory` + one full-width child per slide is the whole
        // mechanism. `scrollbar-none` hides the bar without disabling scroll —
        // overflow-hidden here would kill the swipe.
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>

      {!single && (
        <>
          {/* Pointer controls. Hidden from touch users, who have the gesture. */}
          <button
            type="button"
            onClick={() => takeOver(index - 1)}
            aria-label={labels.prev}
            className="absolute start-3 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-black/55 p-2 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/75 lg:grid"
          >
            <ChevronLeft className="size-5 rtl:-scale-x-100" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => takeOver(index + 1)}
            aria-label={labels.next}
            className="absolute end-3 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-black/55 p-2 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/75 lg:grid"
          >
            <ChevronRight className="size-5 rtl:-scale-x-100" strokeWidth={2.4} />
          </button>

          {/* Dots. Also the position readout — with a snap carousel there is
              otherwise nothing to say how many are left. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 lg:bottom-4">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => takeOver(i)}
                aria-label={labels.goTo[i]}
                aria-current={i === index ? "true" : undefined}
                className={`pointer-events-auto h-1.5 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-5 bg-foreground"
                    : "w-1.5 bg-white/45 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** One slide. Full width of the track, and a snap point. */
export function CarouselSlide({ children }: { children: React.ReactNode }) {
  return <div className="w-full shrink-0 snap-center">{children}</div>;
}
