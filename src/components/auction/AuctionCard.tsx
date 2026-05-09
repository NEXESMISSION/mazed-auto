"use client";

import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Clock, Gavel, Users } from "lucide-react";
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

interface Props {
  auction: Auction;
  variant?: "default" | "featured";
}

/**
 * Image-forward auction card. Big rounded photo, countdown pill overlay
 * top-right, arrow chip top-left (RTL: flipped), title + price + activity
 * counters underneath. Matches the dark-gold remix of the modern marketplace
 * card pattern.
 */
export function AuctionCard({ auction, variant = "default" }: Props) {
  const { vehicle, currentPrice, totalParticipants, totalBids, endTime } =
    auction;
  const isFeatured = variant === "featured";
  const isOver =
    FINAL_STATUSES.has(auction.status) || endTime.getTime() <= Date.now();

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group block"
      aria-label={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
    >
      <div className="relative">
        {/* Image wrapper — large rounded photo, the visual anchor */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl bg-[var(--surface-2)]",
            "aspect-[4/5]",
            "ring-1 ring-[var(--border)] group-hover:ring-[var(--gold-soft)]/40",
            "transition-all duration-300",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(vehicle.imageUrls[0], { width: 500, quality: 65 })}
            alt={`${vehicle.make} ${vehicle.model}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />

          {/* Subtle bottom gradient so the chip on the corner is always readable */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Ended overlay — desaturates the photo so an over auction reads
              as inactive at a glance, not just from the badge text. */}
          {isOver && (
            <div className="pointer-events-none absolute inset-0 bg-black/55 mix-blend-multiply" />
          )}

          {/* Status pill — top start (RTL: top-right). Live = countdown,
              over = unmistakable red Terminée badge. */}
          <div className="absolute top-2.5 start-2.5">
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
          </div>

          {/* Featured / VIP / alert badges — second row of pills if any */}
          {(auction.isVip || isFeatured) && (
            <div className="absolute top-2.5 end-2.5">
              <span className="inline-flex items-center px-2 h-6 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold uppercase tracking-wider shadow-[var(--shadow-gold)]">
                {auction.isVip ? "VIP" : "En vedette"}
              </span>
            </div>
          )}

          {/* Arrow open-chip — bottom end (RTL: bottom-left), gold */}
          <div className="absolute bottom-2.5 end-2.5">
            <span
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full",
                "bg-gradient-to-b from-[var(--gold-bright)] to-[var(--gold)]",
                "text-black shadow-[var(--shadow-gold)]",
                "ring-1 ring-black/10",
                "transition-transform group-hover:scale-110 group-hover:rotate-45",
              )}
            >
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>

          {/* Favorite — bottom start, on top of the gradient */}
          <div className="absolute bottom-2.5 start-2.5">
            <FavoriteButton
              auctionId={auction.id}
              size="sm"
              className="bg-black/50 backdrop-blur-md text-white border-white/10 hover:bg-black/70"
            />
          </div>
        </div>

        {/* Body */}
        <div className="px-1 pt-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-[15px] leading-tight line-clamp-1 flex-1">
              {vehicle.make} {vehicle.model}{" "}
              <span className="text-[var(--foreground-muted)] font-medium">
                {vehicle.year}
              </span>
            </h3>
            <span className="shrink-0 text-[9px] font-bold tracking-[0.05em] tabular-nums text-[var(--foreground-subtle)] mt-0.5 font-mono">
              {auctionCode(auction.id)}
            </span>
          </div>

          {/* Price + activity row */}
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-base tabular-nums gradient-gold-text">
              {formatPrice(currentPrice)}
            </span>
            <span className="flex items-center gap-2.5 text-[11px] text-[var(--foreground-muted)] tabular-nums">
              <span className="inline-flex items-center gap-0.5" title={totalBids === 1 ? "1 enchère" : `${totalBids} enchères`}>
                <Gavel className="h-3 w-3" />
                {totalBids}
              </span>
              <span className="inline-flex items-center gap-0.5" title={totalParticipants === 1 ? "1 participant" : `${totalParticipants} participants`}>
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
