import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Flame, Users } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { ScrollableRow } from "./ScrollableRow";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { HotAuction } from "@/lib/db";

interface Props {
  items: HotAuction[];
  /** Seller IDs whose active plan grants `has_trusted_seller_badge`.
   *  When the seller's id is in the set, the AuctionCard renders the
   *  "Confiance" pill. Optional — defaults to no badges shown. */
  trustedSellerIds?: Set<string>;
}

/**
 * "Hot right now" — live auctions ranked by bids in the last hour.
 * Adds a small overlay pill on each card showing the recent activity
 * count, so the FOMO signal ("people are bidding RIGHT NOW") is visible
 * before the user clicks through.
 *
 * Mobile keeps the horizontal ScrollableRow. Desktop swaps to a clean
 * 3/4-col grid so the row reads as a curated lineup, not a thumbnail
 * filmstrip.
 */
export function HotNowRail({ items, trustedSellerIds }: Props) {
  // Don't render the rail at all if nothing has any traction in the last
  // hour — it'd just look like a duplicate of the other rails.
  const interesting = items.filter((a) => a.recentBids > 0);
  if (interesting.length === 0) return null;

  return (
    <section className="mt-7 lg:mt-14">
      {/* Mobile header */}
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
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

      {/* Desktop header */}
      <DesktopRailHeader
        eyebrow="Maintenant"
        title="En feu"
        accent="cette heure"
        subtitle="Les enchères qui chauffent dans la dernière heure"
        IconLeft={Flame}
        accentColor="#ff6b3a"
        href="/auctions"
        count={interesting.length}
      />

      {/* Mobile scroller */}
      <div className="lg:hidden">
        <ScrollableRow trackClassName="flex gap-3 px-4 pb-1">
          {interesting.map((auction, i) => (
            <div key={auction.id} className="relative w-[230px] shrink-0">
              <AuctionCard
              auction={auction}
              isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
              /* First 3 thumbnails are above-the-fold on every phone
                 we ship to (rail starts at the top of the home feed
                 on the mobile layout). Eager-load them so the user
                 sees real photos on first paint instead of a wave
                 of placeholders that resolve over a couple seconds. */
              priority={i < 3}
            />
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
        </ScrollableRow>
      </div>

      {/* Desktop grid */}
      <div className="hidden lg:grid px-8 grid-cols-3 xl:grid-cols-4 gap-6">
        {interesting.slice(0, 4).map((auction) => (
          <div key={auction.id} className="relative">
            <AuctionCard
              auction={auction}
              isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
              /* All 4 desktop slots are above-the-fold; eager-load. */
              priority
            />
            <span className="pointer-events-none absolute top-3 end-3 z-10 inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-[#ff4d2a] text-white text-[11px] font-extrabold uppercase tracking-wider shadow-[0_0_22px_rgba(255,77,42,0.55)]">
              <Flame className="h-3.5 w-3.5" />
              {auction.recentBids} {auction.recentBids === 1 ? "offre" : "offres"} / 1 h
              {auction.recentBidders > 1 && (
                <span className="ms-0.5 inline-flex items-center gap-0.5 opacity-90">
                  <Users className="h-3 w-3" />
                  {auction.recentBidders}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
