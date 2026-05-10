"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { thumb } from "@/lib/imageUrl";
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
 * Swipeable horizontal slider through every photo, with auto-advance.
 * Built as a translate-X track (one frame per child, full-width) so the
 * user can drag/swipe between photos and watch them slide past — feels
 * like a native gallery on phones. Tappable prev/next chevrons sit on
 * either side at full size on mobile too. Manual interaction (drag or
 * arrow tap) pauses the timer ~7s so users can read what they jumped
 * to. Single-image inputs render as a static photo with no controls.
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

  // Live drag state — kept in refs to avoid re-rendering on every pointer
  // tick, then committed to state when the gesture ends.
  const dragStartXRef = useRef<number | null>(null);
  const dragStartActiveRef = useRef(0);
  const trackWidthRef = useRef(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const single = images.length <= 1;

  useEffect(() => {
    if (images.length <= 1 || intervalMs <= 0) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      if (dragStartXRef.current !== null) return;
      setActive((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  const pauseAuto = useCallback(() => {
    pauseUntilRef.current = Date.now() + intervalMs * 1.5;
  }, [intervalMs]);

  const jumpTo = useCallback(
    (i: number) => {
      setActive(((i % images.length) + images.length) % images.length);
      pauseAuto();
    },
    [images.length, pauseAuto],
  );

  const step = useCallback(
    (delta: number) => {
      setActive((i) => (i + delta + images.length) % images.length);
      pauseAuto();
    },
    [images.length, pauseAuto],
  );

  // Pointer-event drag — works for touch, mouse, pen. We commit when
  // the user releases, snapping to the closest frame; if they dragged
  // > 18% of the track width or flicked fast, we advance one frame.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (single) return;
    if (!trackRef.current) return;
    trackWidthRef.current = trackRef.current.clientWidth;
    dragStartXRef.current = e.clientX;
    dragStartActiveRef.current = active;
    setIsDragging(true);
    pauseAuto();
    // Capture so we keep getting move/up events even if the cursor
    // leaves the element bounds mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartXRef.current === null) return;
    setDragOffset(e.clientX - dragStartXRef.current);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartXRef.current === null) return;
    const delta = e.clientX - dragStartXRef.current;
    const w = trackWidthRef.current || 1;
    const ratio = delta / w;
    let next = dragStartActiveRef.current;
    if (ratio < -0.18) next = dragStartActiveRef.current + 1;
    else if (ratio > 0.18) next = dragStartActiveRef.current - 1;
    next = ((next % images.length) + images.length) % images.length;
    setActive(next);
    setDragOffset(0);
    setIsDragging(false);
    dragStartXRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // Translate as a percentage so the value scales with width and we
  // never need to read DOM dimensions for the rest case.
  const basePercent = -active * 100;
  const dragPercent =
    isDragging && trackWidthRef.current
      ? (dragOffset / trackWidthRef.current) * 100
      : 0;
  const translateX = `${basePercent + dragPercent}%`;

  return (
    <div
      data-swipe-skip
      className={cn(
        "relative overflow-hidden bg-[var(--surface-2)] select-none",
        className,
      )}
    >
      <div
        ref={trackRef}
        className="absolute inset-0 flex"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translate3d(${translateX},0,0)`,
          transition: isDragging
            ? "none"
            : "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: "pan-y",
          willChange: "transform",
        }}
      >
        {images.map((src, i) => (
          <div
            key={i}
            className="relative h-full w-full shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(src, { width: 1280, quality: 75 })}
              alt={`${alt} ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 ? "high" : "auto"}
              draggable={false}
              className="h-full w-full object-cover pointer-events-none"
            />
          </div>
        ))}
      </div>

      {/* Children (gradients, floating buttons, title overlays) sit on top */}
      {children}

      {!single && (
        <>
          {/* Prev / next arrows — full-size on mobile too. Larger tap
              target (44px) than the previous 36px so users on phones
              don't have to aim. */}
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Précédent"
            className="absolute start-2 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/75 hover:border-white/25 active:scale-95 transition-all"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Suivant"
            className="absolute end-2 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/75 hover:border-white/25 active:scale-95 transition-all"
          >
            <ChevronRight className="h-5 w-5 rtl:rotate-180" />
          </button>

          {/* Dot indicators — tap to jump. */}
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
