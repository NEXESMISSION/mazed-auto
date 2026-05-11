import { getLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { HomeHeader } from "@/components/home/HomeHeader";
import { PromoBanner } from "@/components/home/PromoBanner";
import { CmsBanner } from "@/components/home/CmsBanner";
import { NewestRibbon } from "@/components/home/NewestRibbon";
import { RecommendedRail } from "@/components/home/RecommendedRail";
import { EndingSoonRail } from "@/components/home/EndingSoonRail";
import { VipRail } from "@/components/home/VipRail";
import { HotNowRail } from "@/components/home/HotNowRail";
import { RecentlyEndedRail } from "@/components/home/RecentlyEndedRail";
import { LiveActivityTicker } from "@/components/home/LiveActivityTicker";
import { BrandSlider } from "@/components/home/BrandSlider";
import { DesktopHero } from "@/components/home/DesktopHero";
import { DesktopFinalCta } from "@/components/home/DesktopFinalCta";
import { HomeSectionDivider } from "@/components/home/HomeSectionDivider";
import { createClient } from "@/lib/supabase/server";
import { getHomeRailsCached } from "@/lib/home-cache";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAIL_COUNT = 6;

export default async function HomePage() {
  const supabase = await createClient();

  // Run the cached rails fetch + the per-user auth/bid lookup in parallel.
  // The rails come from a 30s in-memory TTL so warm requests skip 7
  // Supabase roundtrips entirely; only the bid-history query (which
  // depends on the signed-in user) runs per-request.
  const [rails, { data: userResp }, locale] = await Promise.all([
    getHomeRailsCached(),
    supabase.auth.getUser(),
    getLocale(),
  ]);
  const user = userResp?.user ?? null;
  const { hot, endingSoon, newest, vip, recentlyEnded, activitySeed, cmsBanners } =
    rails;

  const rawBids = user
    ? await supabase.from("bids").select("auction_id").eq("user_id", user.id)
    : { data: null as { auction_id: string }[] | null };

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
  const topBanner = cmsBanners[0] ?? null;

  return (
    <AppShell noTopBar>
      <HomeHeader signedIn={Boolean(user)} />
      <CmsBanner banner={topBanner} locale={locale} />

      {/* Mobile-only PromoBanner. Desktop has its own cinematic hero. */}
      <div className="lg:hidden">
        <PromoBanner pool={livePool} />
      </div>

      {/* DESKTOP cinematic hero — full-bleed atmospheric backdrop, magazine
          spread (1 featured + 3 runners), live indicator, big editorial
          headline. Mobile is unaffected (the section is hidden lg:block). */}
      <DesktopHero
        hot={hot}
        ending={endingSoon}
        newest={newest}
        livePoolSize={livePool.length}
      />

      <div className="lg:max-w-[var(--max-w-wide)] lg:mx-auto">
        {/* Newness — leading the feed so every visit feels fresh */}
        <NewestRibbon items={newest} />

        {/* ════════════════════════════════════════════════════════════
            SECTION · LIVE AUCTIONS — everything happening right now.
            Visually grouped under one banner so the user understands
            this entire block is "what's biddable today".
            ════════════════════════════════════════════════════════════ */}
        <HomeSectionDivider
          eyebrow="Enchères en direct"
          title="Les voitures à miser"
          subtitle="Hot, urgentes, VIP et personnalisées — toutes biddables maintenant."
          tone="live"
        />

        {/* 🔥 Hottest signal — bidding right now */}
        <HotNowRail items={hot} />

        {/* Urgency — countdown (24h window, regular cards) */}
        <EndingSoonRail items={filteredEndingSoon} />

        {/* Editorial — premium VIP picks */}
        <VipRail items={filteredVip} />

        {/* Personalised */}
        <RecommendedRail items={recommended} />

        {/* Real-time activity ticker */}
        <LiveActivityTicker initial={activitySeed} />

        {/* ════════════════════════════════════════════════════════════
            SECTION · SOLD — recently ended. Clearly separated from the
            live section above so the user knows everything below is
            history / social proof, not biddable.
            ════════════════════════════════════════════════════════════ */}
        <HomeSectionDivider
          eyebrow="Récemment vendues"
          title="La preuve qu'on vend"
          subtitle="Voitures attribuées dans les 72 dernières heures."
          tone="ended"
        />

        {/* Social proof — "this car just sold for X" */}
        <RecentlyEndedRail items={recentlyEnded} />

        {/* Discovery footer */}
        <BrandSlider pool={brandPool} />

        {/* Desktop closing CTA — buyer + seller pillars. Hidden on mobile. */}
        <DesktopFinalCta />

        <span className="block h-2" aria-hidden />
      </div>
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
