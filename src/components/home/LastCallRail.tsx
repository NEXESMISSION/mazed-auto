"use client";

import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Bell } from "lucide-react";
import { Countdown } from "@/components/auction/Countdown";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * "Dernière chance" — auctions ending in the next 60 minutes. Sharpest
 * urgency framing on the home: red pulse on every card, big countdown,
 * compact wide tile so the user can scan several at once.
 *
 * Visually distinct from "Bientôt terminé" (24h window, regular cards)
 * so the two rails read as different urgency tiers, not duplicates.
 */
export function LastCallRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="px-4 mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-70" />
            <span className="relative h-2 w-2 rounded-full bg-red-500" />
          </span>
          Dernière chance
          <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
            ({items.length})
          </span>
        </h2>
        <Link
          href="/auctions?sort=ending_soon"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-3 px-4 pb-1">
          {items.map((a) => (
            <Link
              key={a.id}
              href={`/auctions/${a.id}`}
              className="group relative w-[280px] shrink-0 rounded-2xl bg-gradient-to-br from-[#1a0606] via-[var(--surface)] to-[var(--surface-2)] border border-red-500/30 hover:border-red-500/60 transition-colors overflow-hidden"
            >
              <div className="flex items-stretch gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb(a.vehicle.imageUrls[0], { width: 200, quality: 65 })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-20 w-24 rounded-[var(--radius-sm)] object-cover shrink-0"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-sm leading-tight line-clamp-1">
                      {a.vehicle.make} {a.vehicle.model}{" "}
                      <span className="text-[var(--foreground-muted)] font-medium">
                        {a.vehicle.year}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                      {a.totalBids}{" "}
                      {a.totalBids === 1 ? "offre" : "offres"} · {a.vehicle.city}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="font-extrabold tabular-nums text-[13px] gradient-gold-text">
                      {formatPrice(a.currentPrice)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-red-500/15 border border-red-500/40 text-red-300">
                      <Bell className="h-3 w-3" />
                      <Countdown
                        endTime={a.endTime}
                        size="sm"
                        withIcon={false}
                        className="text-[11px] font-extrabold tabular-nums"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}
