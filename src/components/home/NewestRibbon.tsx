import { Link } from "@/i18n/navigation";
import { Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { DesktopArrowSlider } from "./DesktopArrowSlider";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * Top banner that loops the newest auctions horizontally. Items are duplicated
 * once so the CSS marquee can translate -50% and seam without a jump. Items
 * are passed in from the page so the same set can be excluded from the
 * Recommended rail (no duplicate cars across sections).
 *
 * Mobile: CSS marquee (continuous slide).
 * Desktop: arrow-driven slider with auto-advance — same content, but the
 * user can step through tiles at their own pace via prev/next buttons.
 */
export function NewestRibbon({ items }: Props) {
  if (items.length === 0) return null;

  // Repeat enough times that the track always has ~10+ tiles even
  // when the DB only has 2-3 live auctions — otherwise the marquee
  // reads as "broken" because the same 2 items keep flicking past.
  // Reps must be EVEN so the -50% keyframe loop lands on a duplicate
  // of the first tile (translateX(-50%) of an even-rep track == start
  // of the second half == identical content).
  const wantedReps = Math.max(2, Math.ceil(10 / items.length));
  const reps = wantedReps % 2 === 0 ? wantedReps : wantedReps + 1;
  const loop = Array.from({ length: reps }, () => items).flat();

  // Desktop slider needs the items duplicated once — half-width
  // teleport keeps the loop endless without visible jumps.
  const desktopLoop = [...items, ...items];

  return (
    <section className="pt-5 lg:pt-12" aria-label="Nouvelles voitures">
      {/* Mobile eyebrow — minimal */}
      <div className="lg:hidden px-4 mb-2.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-[var(--gold)]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
          Nouveautés
        </span>
      </div>

      {/* Desktop header — full magazine style */}
      <div className="hidden lg:block px-8 mb-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              <Sparkles className="h-3.5 w-3.5" />
              Tout juste arrivé
            </div>
            <h2 className="mt-1.5 text-3xl xl:text-4xl font-black tracking-tight">
              Les <span className="gradient-gold-text">nouveautés</span>
            </h2>
            <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
              Mises en ligne dans les 48 dernières heures
            </p>
          </div>
          <Link
            href="/auctions?sort=newest"
            className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-[13px] font-bold transition-colors"
          >
            Voir tout →
          </Link>
        </div>
        <div className="mt-5 h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />
      </div>

      {/* Mobile — CSS marquee, untouched */}
      <div className="lg:hidden marquee-viewport">
        <div className="marquee-track marquee-track--fast px-3">
          {loop.map((a, i) => (
            <Tile
              key={`${a.id}-${i}`}
              auction={a}
              ariaHidden={i >= items.length}
            />
          ))}
        </div>
      </div>

      {/* Desktop — arrow slider with auto-advance */}
      <div className="hidden lg:block">
        <DesktopArrowSlider
          ariaLabel="Nouvelles voitures"
          trackClassName="flex gap-5 px-6 pb-1"
          intervalMs={3500}
        >
          {desktopLoop.map((a, i) => (
            <Tile
              key={`${a.id}-${i}-desk`}
              auction={a}
              ariaHidden={i >= items.length}
            />
          ))}
        </DesktopArrowSlider>
      </div>
    </section>
  );
}

function Tile({
  auction,
  ariaHidden,
}: {
  auction: Auction;
  ariaHidden?: boolean;
}) {
  const { vehicle, currentPrice } = auction;
  return (
    <Link
      href={`/auctions/${auction.id}`}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      className="group relative w-[260px] lg:w-[320px] shrink-0 me-4 lg:me-0 overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold-soft)]/50 transition-shadow"
    >
      <div className="relative h-[180px] lg:h-[220px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(vehicle.imageUrls[0], { width: 640, quality: 65 })}
          alt={`${vehicle.make} ${vehicle.model}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        {/* "Nouveau" pill — desktop only */}
        <span className="hidden lg:inline-flex absolute top-3 end-3 items-center gap-1 px-2 h-6 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold uppercase tracking-wider shadow-[var(--shadow-gold)]">
          Nouveau
        </span>
        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3 lg:px-4 lg:pb-4">
          <div className="text-[14px] lg:text-[16px] font-bold leading-tight line-clamp-1 text-white">
            {vehicle.make} {vehicle.model}{" "}
            <span className="text-white/70 font-medium">{vehicle.year}</span>
          </div>
          <div className="text-[15px] lg:text-[17px] font-extrabold tabular-nums gradient-gold-text leading-tight mt-0.5">
            {formatPrice(currentPrice)}
          </div>
        </div>
      </div>
    </Link>
  );
}
