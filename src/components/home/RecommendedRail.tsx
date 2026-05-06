import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";

interface Props {
  excludeIds?: string[];
}

/**
 * Single horizontal rail of auction cards under a "Recommandés / View All" header.
 * Mirrors the "Recommended" section from the reference design — one rail with
 * large image-forward cards, slight peek of the next card to invite scrolling.
 */
export async function RecommendedRail({ excludeIds = [] }: Props = {}) {
  const supabase = await createClient();
  const auctions = await listAuctions(supabase, {
    status: ["active", "ending"],
    limit: 6 + excludeIds.length,
  });
  const exclude = new Set(excludeIds);
  const filtered = auctions.filter((a) => !exclude.has(a.id)).slice(0, 6);
  if (filtered.length === 0) return null;

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

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-3 px-4 pb-1">
          {filtered.map((auction) => (
            <div key={auction.id} className="w-[230px] shrink-0">
              <AuctionCard auction={auction} />
            </div>
          ))}
          {/* Trailing spacer so the last card has breathing room when scrolled */}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}
