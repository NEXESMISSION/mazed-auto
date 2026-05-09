import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Flame, Users } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import type { HotAuction } from "@/lib/db";

interface Props {
  items: HotAuction[];
}

/**
 * "Hot right now" — live auctions ranked by bids in the last hour.
 * Adds a small overlay pill on each card showing the recent activity
 * count, so the FOMO signal ("people are bidding RIGHT NOW") is visible
 * before the user clicks through.
 */
export function HotNowRail({ items }: Props) {
  // Don't render the rail at all if nothing has any traction in the last
  // hour — it'd just look like a duplicate of the other rails.
  const interesting = items.filter((a) => a.recentBids > 0);
  if (interesting.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-[#ff6b3a]" />
          En feu maintenant
          <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
            ({interesting.length})
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

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-3 px-4 pb-1">
          {interesting.map((auction) => (
            <div key={auction.id} className="relative w-[230px] shrink-0">
              <AuctionCard auction={auction} />
              {/* Activity pill — sits above the card, top-end. Glows a
                  subtle red so the eye locks onto it. */}
              <span className="pointer-events-none absolute top-2.5 end-2.5 z-10 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-[#ff4d2a] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-[0_0_18px_rgba(255,77,42,0.55)]">
                <Flame className="h-3 w-3" />
                {auction.recentBids} {auction.recentBids === 1 ? "offre" : "offres"} / 1 h
                {auction.recentBidders > 1 && (
                  <span className="ms-0.5 inline-flex items-center gap-0.5 opacity-80">
                    <Users className="h-2.5 w-2.5" />
                    {auction.recentBidders}
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}
