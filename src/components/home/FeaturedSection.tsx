import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";

interface Props {
  excludeIds?: string[];
}

export async function FeaturedSection({ excludeIds = [] }: Props = {}) {
  const supabase = await createClient();
  const featured = await listAuctions(supabase, {
    featured: true,
    limit: 8 + excludeIds.length,
  });
  const exclude = new Set(excludeIds);
  const filtered = featured.filter((a) => !exclude.has(a.id)).slice(0, 8);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-12 pb-12">
      <div className="max-w-[var(--max-w)] mx-auto px-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
              Enchères <span className="gradient-gold-text">en vedette</span>
            </h2>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              Sélections exclusives de nos meilleurs vendeurs
            </p>
          </div>
          <Link
            href="/auctions"
            className="text-[11px] font-bold text-[var(--gold)] hover:text-[var(--gold-bright)] flex items-center gap-1 shrink-0"
          >
            Voir tout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Mobile: horizontal scroll. Desktop: grid */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto hide-scrollbar">
          <div className="flex gap-3 pb-1">
            {filtered.map((auction) => (
              <div key={auction.id} className="w-[200px] shrink-0">
                <AuctionCard auction={auction} variant="featured" />
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              variant="featured"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
