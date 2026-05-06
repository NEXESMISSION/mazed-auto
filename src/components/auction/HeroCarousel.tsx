"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  images: string[];
  /** Alt text base — index suffix is appended automatically */
  alt: string;
  /** Auto-advance interval in ms. Default 4500. Set to 0 to disable. */
  intervalMs?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Full-bleed image carousel with a soft cross-fade between frames.
 * - Auto-advances every `intervalMs` (default 4500ms)
 * - Fade duration: 700ms (kept under 1.5s so transitions feel snappy)
 * - Tappable prev / next chevrons on either side
 * - Tappable dot indicators at the bottom — manual interaction pauses the
 *   timer for ~7s so users can read what they jumped to
 *
 * Single-image inputs render as a static photo — no fade, no controls.
 */
export function HeroCarousel({
  images,
  alt,
  intervalMs = 4500,
  className,
  children,
}: Props) {
  const [active, setActive] = useState(0);
  // Manual jumps temporarily pause the timer so the user can read what they
  // tapped — saves them fighting the auto-advance.
  const pauseUntilRef = useRef<number>(0);

  useEffect(() => {
    if (images.length <= 1 || intervalMs <= 0) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setActive((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  function pauseAuto() {
    pauseUntilRef.current = Date.now() + intervalMs * 1.5;
  }

  function jumpTo(i: number) {
    setActive(i);
    pauseAuto();
  }

  function step(delta: number) {
    setActive((i) => (i + delta + images.length) % images.length);
    pauseAuto();
  }

  const single = images.length <= 1;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--surface-2)]",
        className,
      )}
    >
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt={`${alt} ${i + 1}`}
          // First image gets eager priority for LCP; the rest lazy-load.
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-[700ms] ease-in-out",
            i === active ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      {/* Children (gradients, floating buttons, title overlays) sit on top */}
      {children}

      {!single && (
        <>
          {/* Prev / next arrows — LTR: prev on the left, next on the right. */}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Précédent"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 hover:border-white/25 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Suivant"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 hover:border-white/25 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dot indicators — tap to jump. Position is conveyed by the
              widening active dot; an explicit "n / m" pill turned out to
              compete with the title overlay and the action cluster, so we
              dropped it. The dots alone are plenty for a 2-12 photo range. */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                aria-label={`Photo ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === active
                    ? "w-6 bg-white"
                    : "w-1.5 bg-white/45 hover:bg-white/70",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
