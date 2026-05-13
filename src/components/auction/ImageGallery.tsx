"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/imageUrl";

interface Props {
  images: string[];
  alt?: string;
}

export function ImageGallery({ images, alt = "" }: Props) {
  const [active, setActive] = useState(0);

  const prev = () => setActive((i) => (i - 1 + images.length) % images.length);
  const next = () => setActive((i) => (i + 1) % images.length);

  return (
    <div className="space-y-2">
      {/* Main image */}
      <div className="relative aspect-[4/3] md:aspect-[16/10] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(images[active], { width: 1200, quality: 75 })}
          srcSet={`${thumb(images[active], { width: 720, quality: 70 })} 720w, ${thumb(images[active], { width: 1200, quality: 75 })} 1200w, ${thumb(images[active], { width: 1600, quality: 75 })} 1600w`}
          sizes="(max-width: 768px) 100vw, 1024px"
          alt={`${alt} ${active + 1}`}
          /* Explicit aspect (the wrapper already enforces 4:3 / 16:10,
             but the dims help the browser allocate space before bytes
             arrive — avoids layout shift on slow networks). */
          width={1200}
          height={900}
          className="h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />

        {/* Counter */}
        <div className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-xs font-semibold tabular-nums">
          {active + 1} / {images.length}
        </div>

        {/* Fullscreen button */}
        <button
          className="absolute top-3 end-3 h-9 w-9 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-black/90 transition-colors"
          aria-label="Plein écran"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        {/* Prev / Next. Position with logical `start`/`end` so the
            buttons flip side under RTL — Arabic reads right-to-left so
            "next" naturally lives on the left edge. The chevron icons
            already reflect the reading direction (prev = ChevronRight
            in this LTR-only layout); the absolute position needs to
            track too. */}
        <button
          onClick={prev}
          className="absolute end-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-black/90 transition-colors"
          aria-label="Précédent"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={next}
          className="absolute start-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-black/90 transition-colors"
          aria-label="Suivant"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              "shrink-0 h-16 w-20 rounded-md overflow-hidden border-2 transition-all",
              i === active
                ? "border-[var(--gold)] opacity-100"
                : "border-transparent opacity-60 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(src, { width: 160, quality: 60 })}
              alt={`thumb-${i}`}
              width={80}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
