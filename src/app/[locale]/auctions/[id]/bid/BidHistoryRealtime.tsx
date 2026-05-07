"use client";

import { Bot, TrendingUp } from "lucide-react";
import { useRealtimeBids } from "@/lib/realtime";
import type { BidRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  auctionId: string;
  totalBids: number;
  /** SSR-fetched seed list — avoids the "..." loading flash. */
  initialBids?: BidRow[];
}

export function BidHistoryRealtime({
  auctionId,
  totalBids,
  initialBids,
}: Props) {
  const { bids } = useRealtimeBids(auctionId, 8, initialBids);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp className="h-3 w-3 text-[var(--gold)]" />
          <span className="font-bold">Enchérisseurs</span>
        </div>
        <span className="text-[10px] text-[var(--foreground-muted)]">
          {totalBids} {totalBids === 1 ? "offre" : "offres"}
        </span>
      </div>
      {bids.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-[var(--foreground-muted)]">
          Aucune offre pour le moment
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {bids.map((b, i) => {
            const label = b.bidder_label || "Enchérisseur";
            return (
              <div
                key={b.id}
                className="py-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0
                        ? "bg-[var(--gold)] text-black"
                        : "bg-[var(--surface)] text-[var(--foreground-muted)]",
                    )}
                  >
                    {label[0]}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold truncate flex items-center gap-1">
                      {label}
                      {b.is_auto_bid && (
                        <Bot className="h-2.5 w-2.5 text-[var(--foreground-muted)]" />
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--foreground-subtle)]">
                      {formatRelativeTime(b.placed_at)}
                    </div>
                  </div>
                </div>
                <div className="font-bold tabular-nums text-[13px] shrink-0">
                  {formatPrice(Number(b.amount))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  return `${Math.floor(hr / 24)} j`;
}
