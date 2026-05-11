import { AppShell } from "@/components/layout/AppShell";
import { BrowseHeader } from "@/components/layout/BrowseHeader";
import { getLiveAuctionsCached } from "@/lib/home-cache";
import {
  getSellerSearchPriorities,
  type SellerSearchPriority,
} from "@/lib/subscription";
import { AuctionsBrowser } from "./AuctionsBrowser";
import { BrowseViewToggle } from "./BrowseViewToggle";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function AuctionsPage({ searchParams }: Props) {
  const [{ view }, auctions] = await Promise.all([
    searchParams,
    // Cached 30s — public read, RLS filters out non-live auctions
    // already, so the full list is shareable across users.
    getLiveAuctionsCached(),
  ]);

  // ONE batched RPC per render — serves both jobs:
  //   (a) Pro-priority sort: nudge subscribed sellers up by their
  //       search_priority_pct (Diamond +25, Gold +10, Silver +0).
  //   (b) Trusted-seller badge: cards rendered on /auctions get the
  //       "Confiance" pill when the seller's plan grants it.
  const sellerIds = Array.from(
    new Set(auctions.map((a) => a.seller.id).filter(Boolean)),
  );
  const priorities =
    sellerIds.length > 0
      ? await getSellerSearchPriorities(sellerIds).catch(
          () => new Map<string, SellerSearchPriority>(),
        )
      : new Map<string, SellerSearchPriority>();

  const ranked = sortByPlanPriority(auctions, priorities);
  const trustedSellerIds = Array.from(priorities.entries())
    .filter(([, p]) => p.hasTrustedSellerBadge)
    .map(([id]) => id);

  return (
    <AppShell noTopBar>
      <BrowseHeader
        eyebrow="Mazed Auto"
        title="Parcourir"
        action={<BrowseViewToggle />}
      />
      <div className="lg:max-w-[var(--max-w-wide)] lg:mx-auto">
        <AuctionsBrowser
          initial={ranked}
          classicMode={view === "classic"}
          trustedSellerIds={trustedSellerIds}
        />
      </div>
    </AppShell>
  );
}

/**
 * Stable Pro-priority sort. Score = original index − (priority% / 100).
 * Diamond (+25%) sellers jump up to 25 positions, Gold (+10%) up to 10,
 * non-Pro stays put. Featured / VIP flags already lifted these to the
 * top; this layer just biases peers within the same band.
 */
function sortByPlanPriority(
  items: Auction[],
  priorities: Map<string, SellerSearchPriority>,
): Auction[] {
  if (items.length === 0 || priorities.size === 0) return items;
  return items
    .map((a, i) => {
      const p = priorities.get(a.seller.id);
      const boost = (p?.searchPriorityPct ?? 0) / 100;
      return { a, score: i - boost * items.length, originalIndex: i };
    })
    .sort((x, y) =>
      x.score !== y.score
        ? x.score - y.score
        : x.originalIndex - y.originalIndex,
    )
    .map((r) => r.a);
}
