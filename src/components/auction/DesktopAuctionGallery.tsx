"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { thumb } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

interface Props {
  images: string[];
  alt: string;
  /** Auto-advance interval in ms. Default 6000. Set to 0 to disable. */
  intervalMs?: number;
}

/**
 * Desktop-only photo gallery for the auction detail page. Big main
 * photo + a horizontal thumbnail strip underneath. Click a thumb to
 * swap the main photo. Auto-cycles slowly (every 6s) until the user
 * interacts, then pauses for ~10s. Prev / next chevrons sit on the
 * main photo edges.
 *
 * Mobile uses a different gallery (HeroCarousel) — this one is
 * scoped to lg+ via its consumer; nothing in this component cares
 * about viewport.
 */
export function DesktopAuctionGallery({
  images,
  alt,
  intervalMs = 6000,
}: Props) {
  const [active, setActive] = useState(0);
  const pauseUntilRef = useRef(0);

  useEffect(() => {
    if (images.length <= 1 || intervalMs <= 0) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setActive((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  function pauseAuto() {
    pauseUntilRef.current = Date.now() + intervalMs * 1.6;
  }

  function step(delta: number) {
    setActive((i) => (i + delta + images.length) % images.length);
    pauseAuto();
  }

  function jumpTo(i: number) {
    setActive(i);
    pauseAuto();
  }

  // Keyboard arrow nav. Scoped to the gallery via its container's
  // tabIndex so we don't interfere with focused inputs / scrolling.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  if (images.length === 0) return null;
  const single = images.length <= 1;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="space-y-3 outline-none"
      aria-label="Galerie photos"
    >
      {/* Main photo — only the active frame (+ its neighbours and the
          first frame for snappy back-nav) actually paints. Everything else
          stays unmounted until the user reaches it, so the page doesn't
          eat 12 image requests on the first paint. */}
      <div className="group relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
        {images.map((src, i) => {
          const distance = Math.min(
            Math.abs(i - active),
            images.length - Math.abs(i - active),
          );
          const shouldRender = i === 0 || distance <= 1;
          if (!shouldRender) return null;
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={thumb(src, { width: 1024, quality: 75 })}
              srcSet={`${thumb(src, { width: 640, quality: 70 })} 640w, ${thumb(src, { width: 1024, quality: 75 })} 1024w, ${thumb(src, { width: 1440, quality: 75 })} 1440w`}
              sizes="(min-width: 1280px) 800px, 100vw"
              alt={`${alt} ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 ? "high" : "auto"}
              draggable={false}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                i === active ? "opacity-100" : "opacity-0",
              )}
            />
          );
        })}

        {!single && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Précédent"
              className="absolute start-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/75 hover:ring-white/30 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Suivant"
              className="absolute end-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/75 hover:ring-white/30 active:scale-95 transition-all"
            >
              <ChevronRight className="h-5 w-5 rtl:rotate-180" />
            </button>
          </>
        )}

        {/* Photo counter pill — bottom-end. Sits over the photo with a
            quiet glassy background, gives the user a constant signal
            of "where am I in this gallery" without dominating. */}
        <div className="absolute bottom-4 end-4 z-10 inline-flex items-center gap-2 px-3 h-8 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/10 text-white text-[12px] font-bold tabular-nums">
          <Maximize2 className="h-3.5 w-3.5 text-white/70" />
          {active + 1} / {images.length}
        </div>
      </div>

      {/* Thumbnail strip — horizontal scroll. The active thumb gets a
          gold ring; others stay muted. Visible 6 at a time on a typical
          desktop, scroll horizontally for the rest. */}
      {!single && (
        <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => jumpTo(i)}
              aria-label={`Photo ${i + 1}`}
              aria-pressed={i === active}
              className={cn(
                "relative shrink-0 h-20 w-28 xl:h-24 xl:w-32 rounded-xl overflow-hidden transition-all",
                i === active
                  ? "ring-2 ring-[var(--gold)] shadow-[var(--shadow-gold)]"
                  : "ring-1 ring-[var(--border)] opacity-65 hover:opacity-100 hover:ring-[var(--gold-soft)]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb(src, { width: 240, quality: 65 })}
                alt={`${alt} ${i + 1} miniature`}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
