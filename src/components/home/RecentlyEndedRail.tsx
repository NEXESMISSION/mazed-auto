import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Award } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { AutoPagingScroller } from "./AutoPagingScroller";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * "Vendues récemment" — auctions that ended in the last 72 hours,
 * presented as social-proof tiles instead of bidding cards. Final price
 * is the hero metric (no countdown), the photo is desaturated and the
 * status pill reads "Vendue · 2 h" so users register the result at a
 * glance and feel "this stuff actually moves".
 */
export function RecentlyEndedRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <Award className="h-4 w-4 text-[var(--gold)]" />
          Vendues récemment
          <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
            ({items.length})
          </span>
        </h2>
        <Link
          href="/auctions"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <AutoPagingScroller>
        <div className="flex gap-3 px-4 pb-1">
          {[...items, ...items].map((auction, i) => {
            const { vehicle, currentPrice, endTime } = auction;
            return (
              <Link
                key={`${auction.id}-${i}`}
                href={`/auctions/${auction.id}`}
                aria-hidden={i >= items.length ? true : undefined}
                className="group relative w-[230px] shrink-0 snap-center block"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] group-hover:ring-[var(--gold-soft)]/40 transition-all">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb(vehicle.imageUrls[0], { width: 460, quality: 65 })}
                    alt={`${vehicle.make} ${vehicle.model}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  {/* Desaturate / dim the photo — instantly reads as "past" */}
                  <div className="pointer-events-none absolute inset-0 bg-black/45 mix-blend-multiply" />

                  {/* "Vendue · Xh" pill (top start) */}
                  <div className="absolute top-2.5 start-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[var(--gold)] text-black text-[11px] font-extrabold uppercase tracking-wider shadow-[var(--shadow-gold)]">
                      <Award className="h-3 w-3" />
                      Vendue · {timeAgo(endTime)}
                    </span>
                  </div>

                  {/* Final price (bottom) — the hero metric */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/70">
                      Prix final
                    </div>
                    <div className="text-xl font-extrabold tabular-nums gradient-gold-text leading-tight">
                      {formatPrice(currentPrice)}
                    </div>
                  </div>
                </div>

                <div className="px-1 pt-2.5">
                  <h3 className="font-bold text-[14px] leading-tight line-clamp-1">
                    {vehicle.make} {vehicle.model}{" "}
                    <span className="text-[var(--foreground-muted)] font-medium">
                      {vehicle.year}
                    </span>
                  </h3>
                  <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5 truncate">
                    {vehicle.city}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </AutoPagingScroller>
    </section>
  );
}

/** "2 h", "12 h", "2 j" — chunky relative time, no library. */
function timeAgo(d: Date): string {
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const days = Math.floor(hr / 24);
  return `${days} j`;
}
