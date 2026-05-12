import type { Metadata } from "next";
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

// ISR — page has no per-user reads (no getUser). The auction pool is
// already served from a 30s in-memory TTL via getLiveAuctionsCached();
// this adds the CDN/edge layer on top so cached HTML serves from
// Vercel instead of triggering a SSR render every request. Realtime
// price/countdown updates land via the per-card client subscription.
export const revalidate = 30;

interface Props {
  searchParams: Promise<{ view?: string; brand?: string; body?: string; q?: string }>;
  params: Promise<{ locale: string }>;
}

/**
 * Browse-page metadata. Beyond a static "all auctions" title we also
 * narrow the title + description when a `?brand=` or `?q=` is set, so
 * shared filtered URLs unfurl with descriptive previews ("Voitures
 * Renault aux enchères — Mazed Auto" rather than the generic browse
 * title). The dynamic title is also what Google shows in SERP, so
 * users searching "Renault Tunisie occasion" benefit from seeing
 * "Renault" right in our snippet.
 */
export async function generateMetadata({
  searchParams,
  params,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const { locale } = await params;
  const isAr = locale === "ar";

  const brand = sp.brand?.trim();
  const q = sp.q?.trim();

  // Title is "Voitures aux enchères — Mazed Auto" by default; narrows
  // to the brand or free-text scope when one is set.
  let title: string;
  let description: string;
  if (brand) {
    title = isAr
      ? `سيارات ${brand} في المزاد — Mazed Auto`
      : `Voitures ${brand} aux enchères — Mazed Auto`;
    description = isAr
      ? `كل سيارات ${brand} المعروضة حالياً للمزاد العلني في تونس. تصفّح، زاود، واربح.`
      : `Toutes les voitures ${brand} actuellement en vente aux enchères en Tunisie. Parcourez, enchérissez, gagnez.`;
  } else if (q) {
    title = isAr
      ? `بحث : ${q} — Mazed Auto`
      : `Recherche : ${q} — Mazed Auto`;
    description = isAr
      ? `نتائج البحث عن ${q} في المزادات الحالية.`
      : `Résultats de recherche pour ${q} parmi les enchères en cours.`;
  } else {
    title = isAr
      ? "كل المزادات السيارات في تونس — Mazed Auto"
      : "Toutes les enchères auto en Tunisie — Mazed Auto";
    description = isAr
      ? "اكتشف كل السيارات المعروضة حالياً للمزاد العلني في تونس. سيارات معتمدة، بائعون موثوقون، أسعار شفافة."
      : "Découvrez toutes les voitures en vente aux enchères en Tunisie. Véhicules vérifiés, vendeurs de confiance, prix transparents.";
  }

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      locale: isAr ? "ar_TN" : "fr_TN",
    },
    twitter: { card: "summary_large_image", title, description },
    // Encourage Google to crawl every filter combination — but cap
    // depth so the bot doesn't recurse into infinite ?brand=X&body=Y&...
    // permutations. Canonical points at the bare /auctions so filtered
    // views don't compete for PageRank against the parent.
    alternates: {
      canonical: "/auctions",
      languages: {
        fr: "/fr/auctions",
        ar: "/ar/auctions",
      },
    },
  };
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
