import Link from "next/link";
import { ArrowRight, Gavel } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow, type BidRow } from "@/lib/db";
import { Countdown } from "@/components/auction/Countdown";
import { formatPrice } from "@/lib/format";

interface Props {
  userId: string;
}

/**
 * Renders a horizontal rail of auctions the user has an active bid on.
 * Hidden if there are none.
 */
export async function ContinueBiddingRail({ userId }: Props) {
  const supabase = await createClient();

  // Latest bid per auction by this user
  const { data: rawBids } = await supabase
    .from("bids")
    .select("auction_id, amount, placed_at")
    .eq("user_id", userId)
    .order("placed_at", { ascending: false });

  const latestByAuction = new Map<string, BidRow>();
  (rawBids ?? []).forEach((b) => {
    if (!latestByAuction.has(b.auction_id)) {
      latestByAuction.set(b.auction_id, b as BidRow);
    }
  });

  if (latestByAuction.size === 0) return null;

  // Pull the corresponding auctions; only keep the live ones
  const ids = Array.from(latestByAuction.keys());
  const { data: rows } = await supabase
    .from("auctions")
    .select("*, seller:sellers(*)")
    .in("id", ids)
    .in("status", ["active", "ending"])
    .order("end_time", { ascending: true });

  if (!rows || rows.length === 0) return null;

  const items = rows.map((r) => {
    const auction = mapAuction(r as unknown as AuctionRow);
    const myAmount = Number(latestByAuction.get(auction.id)!.amount);
    return {
      auction,
      myAmount,
      isWinning: myAmount >= auction.currentPrice,
    };
  });

  return (
    <section className="py-6 md:py-8 border-b border-[var(--border)]">
      <div className="max-w-[var(--max-w)] mx-auto px-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-[var(--gold)]" />
            <h2 className="text-sm font-bold">Suivez vos enchères</h2>
          </div>
          <Link
            href="/buyer/bids"
            className="text-[10px] text-[var(--gold)] hover:underline inline-flex items-center gap-1 font-bold uppercase tracking-wider"
          >
            Voir tout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto hide-scrollbar">
          <div className="flex gap-3 pb-1">
            {items.map(({ auction, myAmount, isWinning }) => (
              <Link
                key={auction.id}
                href={`/auctions/${auction.id}`}
                className="shrink-0 w-[260px] rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)]/50 transition-colors overflow-hidden"
              >
                <div className="aspect-[16/10] bg-[var(--surface-2)] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={auction.vehicle.imageUrls[0]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <div className="font-bold text-sm truncate">
                    {auction.vehicle.make} {auction.vehicle.model}{" "}
                    {auction.vehicle.year}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-bold">
                        Votre offre
                      </div>
                      <div
                        className={`font-bold tabular-nums ${
                          isWinning ? "text-[var(--success)]" : "text-[var(--foreground)]"
                        }`}
                      >
                        {formatPrice(myAmount)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-bold">
                        Actuel
                      </div>
                      <div className="font-bold gradient-gold-text tabular-nums">
                        {formatPrice(auction.currentPrice)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                    <span
                      className={`text-[10px] font-bold ${
                        isWinning
                          ? "text-[var(--success)]"
                          : "text-[var(--danger)]"
                      }`}
                    >
                      {isWinning ? "● En tête" : "● Dépassé"}
                    </span>
                    <Countdown
                      endTime={auction.endTime}
                      size="sm"
                      withIcon={false}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
