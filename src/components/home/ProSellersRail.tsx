import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { ScrollableRow } from "./ScrollableRow";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * Pinned home rail for sellers whose plan grants `has_homepage_placement`
 * (Diamond tier by default). Rendered above the regular newest/recommended
 * rails so paying Pro sellers consistently get top-of-fold exposure.
 *
 * Hidden when the array is empty — most installations won't have Diamond
 * sellers yet.
 */
export function ProSellersRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7 lg:mt-14">
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[var(--gold)]" />
          Vendeurs <span className="gradient-gold-text">Pro</span>
        </h2>
        <Link
          href="/auctions"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <DesktopRailHeader
        eyebrow="Sélection professionnelle"
        title="Vendeurs"
        accent="Pro"
        subtitle="Concessions et agences vérifiées avec compte Diamond"
        IconLeft={Sparkles}
        href="/auctions"
        ctaLabel="Voir tout"
      />

      <ScrollableRow>
        <div className="flex gap-3 lg:gap-5 px-4 lg:px-8 pb-1">
          {items.map((a) => (
            <div
              key={a.id}
              className="w-[200px] lg:w-[260px] shrink-0 snap-center"
            >
              <AuctionCard auction={a} isTrustedSeller />
            </div>
          ))}
        </div>
      </ScrollableRow>
    </section>
  );
}
