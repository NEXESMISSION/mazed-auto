import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Crown } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { ScrollableRow } from "./ScrollableRow";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

export function VipRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="px-4 flex items-center justify-between mb-3">
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

      <ScrollableRow trackClassName="flex gap-3 lg:gap-5 px-4 lg:px-6 pb-1">
        {items.map((auction) => (
          <div
            key={auction.id}
            className="w-[230px] lg:w-[280px] shrink-0"
          >
            <AuctionCard auction={auction} variant="featured" />
          </div>
        ))}
        <div className="w-1 shrink-0" />
      </ScrollableRow>
    </section>
  );
}
