"use client";

import { Link } from "@/i18n/navigation";
import { Clock, Gavel, Users } from "lucide-react";
import { Countdown } from "./Countdown";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

const FINAL_STATUSES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

/**
 * Compact list-view row used as an alternative to the AuctionCard grid on
 * the browse page. Same data, denser layout: small thumbnail on the
 * start, title + meta in the middle, price + countdown on the end.
 */
export function AuctionRow({ auction }: { auction: Auction }) {
  const { vehicle, currentPrice, totalParticipants, totalBids, endTime } =
    auction;
  const isOver =
    FINAL_STATUSES.has(auction.status) ||
    // Coarse "is auction over" check — Date.now is intentional here;
    // the rule misfires for read-only one-shot timestamps.
    // eslint-disable-next-line react-hooks/purity
    endTime.getTime() <= Date.now();

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)]/60 transition-colors group"
      aria-label={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
    >
      <div className="relative h-16 w-20 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--surface-2)] shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(vehicle.imageUrls[0], { width: 220, quality: 65 })}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {isOver && (
          <span className="absolute inset-0 bg-black/55 mix-blend-multiply" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm leading-tight line-clamp-1 group-hover:text-[var(--gold)] transition-colors">
            {vehicle.make} {vehicle.model}{" "}
            <span className="text-[var(--foreground-muted)] font-medium">
              {vehicle.year}
            </span>
          </h3>
          <span className="ms-auto shrink-0 text-[9px] font-bold font-mono tracking-[0.05em] tabular-nums text-[var(--foreground-subtle)]">
            {auctionCode(auction.id)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2.5 text-[11px] text-[var(--foreground-muted)] tabular-nums">
          <span className="inline-flex items-center gap-0.5" title={totalBids === 1 ? "1 enchère" : `${totalBids} enchères`}>
            <Gavel className="h-3 w-3" />
            {totalBids}
          </span>
          <span className="inline-flex items-center gap-0.5" title={totalParticipants === 1 ? "1 participant" : `${totalParticipants} participants`}>
            <Users className="h-3 w-3" />
            {totalParticipants}
          </span>
          <span className="text-[var(--foreground-subtle)]">·</span>
          <span className="truncate">{vehicle.city}</span>
        </div>
      </div>

      <div className="text-end shrink-0">
        <div className="font-extrabold text-sm tabular-nums gradient-gold-text">
          {formatPrice(currentPrice)}
        </div>
        <div className="text-[10px] mt-0.5">
          {isOver ? (
            <span className="inline-flex items-center gap-1 px-1.5 h-4 rounded-full bg-red-500/15 text-red-300 font-bold uppercase tracking-wider">
              <span className="h-1 w-1 rounded-full bg-red-400" />
              Terminée
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--foreground-muted)]">
              <Clock className="h-3 w-3" />
              <Countdown
                endTime={endTime}
                size="sm"
                withIcon={false}
                className="text-[10px] font-bold tabular-nums"
              />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
