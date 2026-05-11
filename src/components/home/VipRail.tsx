import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Crown } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { ScrollableRow } from "./ScrollableRow";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
  trustedSellerIds?: Set<string>;
}

export function VipRail({ items, trustedSellerIds }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7 lg:mt-14">
      {/* Mobile header */}
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <Crown className="h-4 w-4 text-[var(--gold)]" />
          En <span className="gradient-gold-text">vedette</span>
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
        eyebrow="Sélection premium"
        title="En"
        accent="vedette"
        subtitle="Voitures choisies par notre équipe pour leur état et leur valeur"
        IconLeft={Crown}
        href="/auctions"
      />

      {/* Mobile scroller */}
      <div className="lg:hidden">
        <ScrollableRow trackClassName="flex gap-3 px-4 pb-1">
          {items.map((auction) => (
            <div key={auction.id} className="w-[230px] shrink-0">
              <AuctionCard
                auction={auction}
                variant="featured"
                isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
              />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </ScrollableRow>
      </div>

      {/* Desktop grid — gold ring + faint glow strip behind, distinguishes
          VIP from the other 4-col rails without breaking layout rhythm. */}
      <div className="hidden lg:block relative px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-1/2 rounded-[28px] opacity-[0.18]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(212,175,55,0.25), transparent 60%)",
          }}
        />
        <div className="relative grid grid-cols-3 xl:grid-cols-4 gap-6">
          {items.slice(0, 4).map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              variant="featured"
              isTrustedSeller={trustedSellerIds?.has(auction.seller.id) ?? false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
