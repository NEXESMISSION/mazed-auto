import { Link } from "@/i18n/navigation";
import { Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * Top banner that loops the newest auctions horizontally. Items are duplicated
 * once so the CSS marquee can translate -50% and seam without a jump. Items
 * are passed in from the page so the same set can be excluded from the
 * Recommended rail (no duplicate cars across sections).
 */
export function NewestRibbon({ items }: Props) {
  if (items.length === 0) return null;

  const loop = [...items, ...items];

  return (
    <section className="pt-5" aria-label="Nouvelles voitures">
      <div className="px-4 mb-2.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-[var(--gold)]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
          Nouveautés
        </span>
      </div>

      <div className="marquee-viewport">
        <div className="marquee-track gap-3 px-3">
          {loop.map((a, i) => (
            <Link
              key={`${a.id}-${i}`}
              href={`/auctions/${a.id}`}
              aria-hidden={i >= items.length ? true : undefined}
              tabIndex={i >= items.length ? -1 : undefined}
              className="group relative w-[180px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold-soft)]/50 transition-shadow"
            >
              <div className="relative h-[96px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.vehicle.imageUrls[0]}
                  alt={`${a.vehicle.make} ${a.vehicle.model}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-2.5 pb-1.5">
                  <div className="text-[11px] font-bold leading-tight line-clamp-1 text-white">
                    {a.vehicle.make} {a.vehicle.model}{" "}
                    <span className="text-white/70 font-medium">
                      {a.vehicle.year}
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold tabular-nums gradient-gold-text leading-tight">
                    {formatPrice(a.currentPrice)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
