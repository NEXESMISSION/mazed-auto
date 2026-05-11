"use client";

import { useEffect, useState } from "react";
import { Bot, TrendingUp, Trophy } from "lucide-react";
import { useRealtimeBids } from "@/lib/realtime";
import type { BidRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { anonBidder } from "@/lib/anon";
import { cn } from "@/lib/utils";

interface Props {
  auctionId: string;
  totalBids: number;
  /** SSR-fetched seed list — avoids the "..." loading flash. */
  initialBids?: BidRow[];
}

/**
 * Realtime leaderboard of bids on a single auction. Mobile keeps the
 * compact "tab-style" list it had before. Desktop gets bigger row
 * padding, rank pills, and a "newest bid just landed" highlight so the
 * user can see new activity at a glance.
 *
 * All data flows through `useRealtimeBids` which subscribes to INSERT
 * events on the bids table — see lib/realtime.ts. The hook also seeds
 * from SSR (no loading flash) and dedupes by id (no double rows when
 * the user's own bid optimistically appears).
 */
export function BidHistoryRealtime({
  auctionId,
  totalBids,
  initialBids,
}: Props) {
  const { bids } = useRealtimeBids(auctionId, 8, initialBids);
  // Track the freshest bid id so we can paint a subtle highlight on
  // its row for ~3s when it arrives — telegraphs the realtime update
  // to the user without a heavy animation library.
  const [recentId, setRecentId] = useState<string | null>(null);
  useEffect(() => {
    if (bids.length === 0) return;
    const newest = bids[0].id;
    setRecentId(newest);
    const t = setTimeout(() => setRecentId((v) => (v === newest ? null : v)), 3000);
    return () => clearTimeout(t);
  }, [bids]);

  return (
    <div className="space-y-2 lg:space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm">
          <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-[var(--gold)]" />
          <span className="font-bold lg:text-base">Enchérisseurs</span>
        </div>
        <span className="text-[10px] lg:text-[11px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] tabular-nums">
          {totalBids} {totalBids === 1 ? "offre" : "offres"}
        </span>
      </div>

      {bids.length === 0 ? (
        <div className="py-3 lg:py-10 text-center text-[11px] lg:text-sm text-[var(--foreground-muted)]">
          Aucune offre pour le moment
          <div className="hidden lg:block text-[12px] text-[var(--foreground-subtle)] mt-1">
            Soyez le premier à enchérir
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] lg:divide-y-0 lg:space-y-1.5">
          {bids.map((b, i) => {
            // Always derive the label client-side from user_id — even if a
            // stored bidder_label leaked a real name from old rows, we
            // never render it.
            const label = anonBidder(b.user_id, i);
            const isLeader = i === 0;
            const isFresh = b.id === recentId;
            return (
              <div
                key={b.id}
                className={cn(
                  "py-2 lg:py-3 flex items-center justify-between lg:px-3 lg:rounded-xl transition-colors",
                  isFresh && "lg:bg-[var(--gold-faint)] lg:ring-1 lg:ring-[var(--gold)]/30",
                  !isFresh && isLeader && "lg:bg-[var(--surface-2)]/60",
                )}
              >
                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                  <span
                    className={cn(
                      "h-6 w-6 lg:h-9 lg:w-9 rounded-full flex items-center justify-center text-[10px] lg:text-[12px] font-bold shrink-0 tabular-nums",
                      isLeader
                        ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
                        : "bg-[var(--surface)] lg:bg-[var(--surface-2)] text-[var(--foreground-muted)]",
                    )}
                  >
                    {isLeader ? (
                      <Trophy className="h-3 w-3 lg:h-4 lg:w-4" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] lg:text-sm font-semibold lg:font-bold truncate flex items-center gap-1 lg:gap-1.5">
                      {label}
                      {b.is_auto_bid && (
                        <Bot className="h-2.5 w-2.5 lg:h-3 lg:w-3 text-[var(--foreground-muted)]" />
                      )}
                      {isLeader && (
                        <span className="hidden lg:inline-flex items-center px-1.5 h-4 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] text-[9px] font-extrabold uppercase tracking-wider ms-1">
                          En tête
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] lg:text-[11px] text-[var(--foreground-subtle)] tabular-nums">
                      {formatRelativeTime(b.placed_at)}
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "font-bold lg:font-extrabold tabular-nums text-[13px] lg:text-base shrink-0",
                    isLeader && "gradient-gold-text lg:text-lg",
                  )}
                >
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
