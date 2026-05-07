import { Link } from "@/i18n/navigation";
import { ArrowRight, Flame } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";

interface Props {
  /** Auction ids already shown in another rail above (e.g. ContinueBiddingRail).
   *  We hide them here to avoid duplicates on the home page. */
  excludeIds?: string[];
}

export async function EndingSoonSection({ excludeIds = [] }: Props = {}) {
  const supabase = await createClient();
  // Fetch a few extra so we still have 4 to show after filtering.
  const auctions = await listAuctions(supabase, {
    status: ["active", "ending"],
    limit: 4 + excludeIds.length,
  });
  const exclude = new Set(excludeIds);
  const filtered = auctions.filter((a) => !exclude.has(a.id)).slice(0, 4);
  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-12">
      <div className="max-w-[var(--max-w)] mx-auto px-4">
        <div className="flex items-end justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Flame className="h-5 w-5 text-[var(--danger)]" />
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                Bientôt terminé
              </h2>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Dernières opportunités
              </p>
            </div>
          </div>
          <Link
            href="/auctions?sort=ending_soon"
            className="text-[11px] font-bold text-[var(--gold)] hover:text-[var(--gold-bright)] flex items-center gap-1 shrink-0"
          >
            Voir tout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Mobile: horizontal carousel. Desktop: 4-col grid. */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto hide-scrollbar">
          <div className="flex gap-3 pb-1">
            {filtered.map((auction) => (
              <div key={auction.id} className="w-[200px] shrink-0">
                <AuctionCard auction={auction} />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-5">
          {filtered.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      </div>
    </section>
  );
}
