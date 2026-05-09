import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { AutoPagingScroller } from "./AutoPagingScroller";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

export function RecommendedRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">Recommandés</h2>
        <Link
          href="/auctions"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <AutoPagingScroller>
        {/* Items duplicated once so AutoPagingScroller can teleport
            back at the halfway boundary without any visible content
            change — the loop reads as endless. */}
        <div className="flex gap-3 px-4 pb-1">
          {[...items, ...items].map((auction, i) => (
            <div
              key={`${auction.id}-${i}`}
              aria-hidden={i >= items.length ? true : undefined}
              className="w-[230px] shrink-0 snap-center"
            >
              <AuctionCard auction={auction} />
            </div>
          ))}
        </div>
      </AutoPagingScroller>
    </section>
  );
}
