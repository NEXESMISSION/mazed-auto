import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { AutoPagingScroller } from "./AutoPagingScroller";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
  trustedSellerIds?: Set<string>;
}

export function RecommendedRail({ items, trustedSellerIds }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-6 lg:mt-14">
      {/* Mobile header */}
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">Recommandés</h2>
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
        eyebrow="Pour vous"
        title="Choisis"
        accent="pour vous"
        subtitle="Pondéré sur vos enchères et marques préférées"
        IconLeft={Sparkles}
        href="/auctions"
      />

      {/* Mobile scroller — duplicated items for the auto-paging loop */}
      <div className="lg:hidden">
        <AutoPagingScroller>
          <div className="flex gap-3 px-4 pb-1">
            {[...items, ...items].map((auction, i) => (
              <div
                key={`${auction.id}-${i}`}
                aria-hidden={i >= items.length ? true : undefined}
                className="w-[230px] shrink-0 snap-center"
              >
                <AuctionCard
                  auction={auction}
                  isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
                />
              </div>
            ))}
          </div>
        </AutoPagingScroller>
      </div>

      {/* Desktop grid */}
      <div className="hidden lg:grid px-8 grid-cols-3 xl:grid-cols-4 gap-6">
        {items.slice(0, 4).map((auction) => (
          <AuctionCard key={auction.id} auction={auction} />
        ))}
      </div>
    </section>
  );
}
