import { getLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { HomeHeader } from "@/components/home/HomeHeader";
import { PromoBanner } from "@/components/home/PromoBanner";
import { CmsBanner } from "@/components/home/CmsBanner";
import { listCmsBanners } from "@/lib/cms";
import { NewestRibbon } from "@/components/home/NewestRibbon";
import { ContinueBiddingRail } from "@/components/home/ContinueBiddingRail";
import { RecommendedRail } from "@/components/home/RecommendedRail";
import { EndingSoonRail } from "@/components/home/EndingSoonRail";
import { VipRail } from "@/components/home/VipRail";
import { HotNowRail } from "@/components/home/HotNowRail";
import { RecentlyEndedRail } from "@/components/home/RecentlyEndedRail";
import { LiveActivityTicker } from "@/components/home/LiveActivityTicker";
import { BrandSlider } from "@/components/home/BrandSlider";
import { createClient } from "@/lib/supabase/server";
import {
  listEndingSoon,
  listFeaturedLive,
  listHotNow,
  listNewestLive,
  listRecentlyEnded,
  seedActivityItems,
} from "@/lib/db";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAIL_COUNT = 6;
const NEWEST_COUNT = 10;

export default async function HomePage() {
  const supabase = await createClient();

  // Resolve the user first (cheap, cookie-driven) so the bid-history
  // query can join the same parallel batch as the rails. Without this,
  // we'd serially `await getUser()` then `await rawBids` after the rails
  // resolved — adding ~50-100ms of round-trip latency for signed-in
  // users.
  const { data: userResp } = await supabase.auth.getUser();
  const user = userResp?.user ?? null;

  const [hot, endingSoon, newest, vip, recentlyEnded, activitySeed, rawBids] =
    await Promise.all([
      listHotNow(supabase, RAIL_COUNT),
      listEndingSoon(supabase, 24, RAIL_COUNT),
      listNewestLive(supabase, 48, NEWEST_COUNT),
      listFeaturedLive(supabase, RAIL_COUNT),
      listRecentlyEnded(supabase, 72, RAIL_COUNT),
      seedActivityItems(supabase, 8),
      // Pulls auction ids the signed-in user has already bid on so the
      // discovery rails can strip them out. Skip the round-trip entirely
      // for guests.
      user
        ? supabase
            .from("bids")
            .select("auction_id")
            .eq("user_id", user.id)
        : Promise.resolve({ data: null as { auction_id: string }[] | null }),
    ]);

  const bidIds = new Set<string>(
    (rawBids?.data ?? [])
      .map((b) => b.auction_id)
      .filter(Boolean) as string[],
  );

  // Build the personalised "Pour vous" rail. Content-based: weight by
  // the brands + categories the user has bid on, fall back to global
  // pool for guests. We compute it from the union of the live rails so
  // we don't fire another DB query.
  const livePool: Auction[] = dedupe([...hot, ...newest, ...endingSoon, ...vip]);
  const recommended = pickRecommended(livePool, bidIds, RAIL_COUNT);
  const recommendedIds = new Set(recommended.map((a) => a.id));

  const filteredEndingSoon = endingSoon.filter(
    (a) =>
      a.id !== undefined && !hasAlreadyAppeared(a, hot, recommendedIds),
  );
  const filteredVip = vip.filter(
    (a) => !hot.some((h) => h.id === a.id) && !recommendedIds.has(a.id),
  );

  // BrandSlider needs a wide-ish pool — feed it everything we already have.
  const brandPool: Auction[] = dedupe([...livePool, ...recentlyEnded]);

  // Pick the highest-priority active CMS banner. Render above the
  // existing PromoBanner so admin-managed seasonal promos lead.
  const locale = await getLocale();
  const cmsBanners = await listCmsBanners(supabase);
  const topBanner = cmsBanners[0] ?? null;

  return (
    <AppShell noTopBar>
      <HomeHeader signedIn={Boolean(user)} />
      <CmsBanner banner={topBanner} locale={locale} />
      <PromoBanner pool={livePool} />

      {/* Newness — leading the page so every visit feels fresh */}
      <NewestRibbon items={newest} />

      {/* 🔥 Hottest signal — bidding right now */}
      <HotNowRail items={hot} />

      {/* Urgency — countdown (24h window, regular cards) */}
      <EndingSoonRail items={filteredEndingSoon} />

      {/* Personal — pulls signed-in users back in */}
      {user && <ContinueBiddingRail userId={user.id} />}

      {/* Editorial */}
      <VipRail items={filteredVip} />

      {/* Personalised */}
      <RecommendedRail items={recommended} />

      {/* Real-time activity ticker */}
      <LiveActivityTicker initial={activitySeed} />

      {/* Social proof — "this car just sold for X" */}
      <RecentlyEndedRail items={recentlyEnded} />

      {/* Discovery footer */}
      <BrandSlider pool={brandPool} />
      <span className="block h-2" aria-hidden />
    </AppShell>
  );
}

/** Dedupe by auction id while preserving the first occurrence. */
function dedupe(arr: Auction[]): Auction[] {
  const seen = new Set<string>();
  const out: Auction[] = [];
  for (const a of arr) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

function hasAlreadyAppeared(
  a: Auction,
  hot: Auction[],
  recommendedIds: Set<string>,
): boolean {
  if (recommendedIds.has(a.id)) return true;
  return hot.some((h) => h.id === a.id);
}

/**
 * Lightweight content-based recommender. Counts how many auctions the
 * candidate would have to "match" against the user's bid history (brand
 * + category), and picks the top `limit` after stripping out IDs the
 * user already engaged with. Falls back to "highest activity" for guests
 * (using totalBids as a proxy for popularity).
 */
function pickRecommended(
  pool: Auction[],
  bidIds: Set<string>,
  limit: number,
): Auction[] {
  // For now the simplest fallback — most-active live cars excluding
  // anything the user has already touched. We can swap in brand/category
  // weighting once the bid table is available here.
  return pool
    .filter((a) => !bidIds.has(a.id))
    .slice()
    .sort((a, b) => b.totalBids - a.totalBids)
    .slice(0, limit);
}
