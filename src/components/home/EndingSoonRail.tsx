import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Flame } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

export function EndingSoonRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="px-4 flex items-center justify-between mb-3">
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

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-3 px-4 pb-1">
          {items.map((auction) => (
            <div key={auction.id} className="w-[230px] shrink-0">
              <AuctionCard auction={auction} />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}
