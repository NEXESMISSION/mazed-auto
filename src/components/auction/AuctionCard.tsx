"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Heart, MessageSquare } from "lucide-react";
import { Countdown } from "./Countdown";
import { FavoriteButton } from "./FavoriteButton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

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
            src={vehicle.imageUrls[0]}
            alt={`${vehicle.make} ${vehicle.model}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />

          {/* Subtle bottom gradient so the chip on the corner is always readable */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Countdown pill — top start (RTL: top-right) */}
          <div className="absolute top-2.5 start-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white">
              <Clock className="h-3 w-3 text-[var(--gold)]" />
              <Countdown
                endTime={endTime}
                size="sm"
                withIcon={false}
                className="text-[11px] font-bold tabular-nums"
              />
            </span>
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
          <h3 className="font-bold text-[15px] leading-tight line-clamp-1">
            {vehicle.make} {vehicle.model}{" "}
            <span className="text-[var(--foreground-muted)] font-medium">
              {vehicle.year}
            </span>
          </h3>

          {/* Price + activity row */}
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-base tabular-nums gradient-gold-text">
              {formatPrice(currentPrice)}
            </span>
            <span className="flex items-center gap-2.5 text-[11px] text-[var(--foreground-muted)] tabular-nums">
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {totalBids}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Heart className="h-3 w-3" />
                {totalParticipants}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
