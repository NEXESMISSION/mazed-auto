import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Flame } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { ScrollableRow } from "./ScrollableRow";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
  trustedSellerIds?: Set<string>;
}

export function EndingSoonRail({ items, trustedSellerIds }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7 lg:mt-14">
      {/* Mobile header */}
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-[var(--danger)]" />
          Bientôt terminé
        </h2>
        <Link
          href="/auctions?sort=ending_soon"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Desktop header */}
      <DesktopRailHeader
        eyebrow="Dernière chance"
        title="Bientôt"
        accent="terminé"
        subtitle="Ces enchères se clôturent dans les 24 prochaines heures"
        IconLeft={Flame}
        accentColor="var(--danger)"
        href="/auctions?sort=ending_soon"
        count={items.length}
      />

      {/* Mobile scroller — untouched */}
      <div className="lg:hidden">
        <ScrollableRow trackClassName="flex gap-3 px-4 pb-1">
          {items.map((auction) => (
            <div key={auction.id} className="w-[230px] shrink-0">
              <AuctionCard
                auction={auction}
                isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
              />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </ScrollableRow>
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
