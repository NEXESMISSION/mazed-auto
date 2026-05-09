"use client";

import { Link } from "@/i18n/navigation";
import { Clock, Gavel, Users, MapPin } from "lucide-react";
import { Countdown } from "./Countdown";
import { FavoriteButton } from "./FavoriteButton";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

const FINAL_STATUSES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

/**
 * Large single-column variant of AuctionCard for the "Grand" layout
 * mode in the browse page. 16:9 hero image, big price + countdown,
 * city + bid count overlay. Uses more screen real-estate per card so
 * users who prefer detail over density can read every listing without
 * tapping in.
 */
export function LargeAuctionCard({ auction }: { auction: Auction }) {
  const { vehicle, currentPrice, totalParticipants, totalBids, endTime } =
    auction;
  const isOver =
    FINAL_STATUSES.has(auction.status) ||
    // eslint-disable-next-line react-hooks/purity
    endTime.getTime() <= Date.now();

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group block rounded-2xl ring-1 ring-[var(--border)] hover:ring-[var(--gold-soft)]/60 bg-[var(--surface-2)] overflow-hidden transition-all"
      aria-label={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
    >
      <div className="relative aspect-[16/9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(vehicle.imageUrls[0], { width: 900, quality: 70 })}
          alt={`${vehicle.make} ${vehicle.model}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {isOver && (
          <div className="absolute inset-0 bg-black/55 mix-blend-multiply" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />

        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
          {isOver ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-red-500 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-[0_0_18px_rgba(239,68,68,0.55)]">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Terminée
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white">
              <Clock className="h-3 w-3 text-[var(--gold)]" />
              <Countdown
                endTime={endTime}
                size="sm"
                withIcon={false}
                className="text-[11px] font-bold tabular-nums"
              />
            </span>
          )}
          <FavoriteButton
            auctionId={auction.id}
            size="sm"
            className="bg-black/50 backdrop-blur-md text-white border-white/10 hover:bg-black/70"
          />
        </div>

        {/* Bottom — title, price, meta */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold font-mono tracking-[0.08em] tabular-nums text-white/70">
              {auctionCode(auction.id)}
            </span>
          </div>
          <h3 className="font-extrabold text-white text-[18px] leading-tight">
            {vehicle.make} {vehicle.model}{" "}
            <span className="text-white/70 font-medium">{vehicle.year}</span>
          </h3>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span
              className={cn(
                "font-extrabold tabular-nums text-[20px] leading-none",
                "gradient-gold-text",
              )}
            >
              {formatPrice(currentPrice)}
            </span>
            <span className="flex items-center gap-3 text-[11px] text-white/80 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {vehicle.city}
              </span>
              <span className="inline-flex items-center gap-1" title={totalBids === 1 ? "1 enchère" : `${totalBids} enchères`}>
                <Gavel className="h-3 w-3" />
                {totalBids}
              </span>
              <span className="inline-flex items-center gap-1" title={totalParticipants === 1 ? "1 participant" : `${totalParticipants} participants`}>
                <Users className="h-3 w-3" />
                {totalParticipants}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
