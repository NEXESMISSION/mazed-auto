"use client";

import { Crown } from "lucide-react";
import { useRealtimeAuction } from "@/lib/realtime";
import { useExpired } from "@/lib/useExpired";
import { auctionCode } from "@/lib/format";
import type { Auction } from "@/lib/types";

const FINAL_STATUSES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

interface Props {
  initialAuction: Auction;
}

/**
 * Tiny client component that owns the badges in the hero overlay.
 * Subscribes to realtime so the moment the auction flips from active
 * to ended the big "Enchère terminée" pill replaces the VIP/featured
 * pills without a page refresh.
 *
 * Lives inside the hero `<HeroCarousel>` overlay. Separate from the
 * main `LiveAuctionPanel` because their layouts can't be co-located —
 * the hero's overlay is positioned absolutely inside the carousel.
 */
export function LiveHeroBadge({ initialAuction }: Props) {
  const auction = useRealtimeAuction(initialAuction);
  const expired = useExpired(auction.endTime);
  const isFinal = FINAL_STATUSES.has(auction.status);
  const isOver = isFinal || expired;

  return (
    <div className="flex items-center gap-2 mb-2 flex-wrap">
      {isOver && (
        <span className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-red-500 text-white text-[11px] font-extrabold uppercase tracking-[0.18em] shadow-[0_0_24px_rgba(239,68,68,0.7)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-white" />
          </span>
          Enchère terminée
        </span>
      )}
      {auction.isVip && !isOver && (
        <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold uppercase tracking-[0.15em]">
          <Crown className="h-2.5 w-2.5" />
          VIP
        </span>
      )}
      {auction.isFeatured && !isOver && (
        <span className="inline-flex items-center px-2 h-5 rounded-full bg-white/15 text-white text-[10px] font-bold uppercase tracking-[0.15em]">
          En vedette
        </span>
      )}
      <span className="inline-flex items-center px-2 h-5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white/85 text-[10px] font-bold font-mono tracking-[0.08em] tabular-nums">
        {auctionCode(auction.id)}
      </span>
    </div>
  );
}
