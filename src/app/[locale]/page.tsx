import { getLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { HomeHeader } from "@/components/home/HomeHeader";
import { PromoBanner } from "@/components/home/PromoBanner";
import { CmsBanner } from "@/components/home/CmsBanner";
import { NewestRibbon } from "@/components/home/NewestRibbon";
import { RecommendedRail } from "@/components/home/RecommendedRail";
import { EndingSoonRail } from "@/components/home/EndingSoonRail";
import { VipRail } from "@/components/home/VipRail";
import { ProSellersRail } from "@/components/home/ProSellersRail";
import { HotNowRail } from "@/components/home/HotNowRail";
import { RecentlyEndedRail } from "@/components/home/RecentlyEndedRail";
import { LiveActivityTicker } from "@/components/home/LiveActivityTicker";
import { BrandSlider } from "@/components/home/BrandSlider";
import { DesktopHero } from "@/components/home/DesktopHero";
import { DesktopFinalCta } from "@/components/home/DesktopFinalCta";
import { HomeSectionDivider } from "@/components/home/HomeSectionDivider";
import { ProUpgradeNudge } from "@/components/home/ProUpgradeNudge";
import { createClient } from "@/lib/supabase/server";
import { getHomeRailsCached, getLiveAuctionsCached } from "@/lib/home-cache";
import {
  getActiveSubscription,
  getSellerSearchPriorities,
} from "@/lib/subscription";
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
  const {
    hot,
    endingSoon,
    newest,
    vip,
    recentlyEnded,
    activitySeed,
    cmsBanners,
    cmsBrands,
  } = rails;

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

  // Diamond plan perk: pinned-pro auctions on the home page. Cheap
  // single-RPC lookup that returns just the auction IDs; we resolve
  // them against the cached live-pool so we never hit the DB twice
  // for the same vehicle. Falls back to an empty array if the RPC
  // hasn't been migrated yet.
  const pinnedPro = await loadPinnedProAuctions(supabase, brandPool).catch(
    () => [],
  );

  // Build a set of seller IDs whose plan grants the trusted-seller
  // badge. Threaded through every rail so the badge shows on cards
  // across the entire home page, not just on /admin/auctions/[id].
  // Pool of seller IDs is the union of the live rails (no extra DB).
  const trustedSellerIds = await loadTrustedSellerIds([
    ...livePool,
    ...recentlyEnded,
    ...pinnedPro,
  ]).catch(() => new Set<string>());

  // Pick the highest-priority active CMS banner. Render above the
  // existing PromoBanner so admin-managed seasonal promos lead.
  const topBanner = cmsBanners[0] ?? null;

  // Show the Pro upgrade nudge to signed-in users who don't already have
  // an active subscription. Check is server-side so the client component
  // never gets handed a "show this" flag for paying customers. The nudge
  // itself enforces the show-once / cooldown logic via localStorage.
  const proNudgeEnabled = user
    ? !(await getActiveSubscription(user.id).catch(() => null))
    : false;

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
        <HotNowRail items={hot} trustedSellerIds={trustedSellerIds} />

        {/* Urgency — countdown (24h window, regular cards) */}
        <EndingSoonRail
          items={filteredEndingSoon}
          trustedSellerIds={trustedSellerIds}
        />

        {/* Pinned Pro — Diamond-plan sellers get a permanent rail.
            Hidden when empty so this is a no-op until someone subscribes. */}
        <ProSellersRail items={pinnedPro} />

        {/* Editorial — premium VIP picks */}
        <VipRail
          items={filteredVip}
          trustedSellerIds={trustedSellerIds}
        />

        {/* Personalised */}
        <RecommendedRail
          items={recommended}
          trustedSellerIds={trustedSellerIds}
        />

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

        {/* Discovery footer — brand-only on purpose (Catégories rail
            removed; categories still live on /auctions?view=classic). */}
        <BrandSlider pool={brandPool} brands={cmsBrands} />

        {/* Desktop closing CTA — buyer + seller pillars. Hidden on mobile. */}
        <DesktopFinalCta />

        <span className="block h-2" aria-hidden />
      </div>

      {/* Pro upgrade nudge — appears after a delay for non-Pro users,
          suppressed for 7 days after dismissal (forever after click). */}
      <ProUpgradeNudge enabled={proNudgeEnabled} />
    </AppShell>
  );
}

/** Dedupe by auction id while preserving the first occurrence. */
/**
 * Build a Set of seller IDs whose active plan grants the
 * trusted-seller badge. One batched RPC call regardless of how many
 * sellers appear across the rails. Falls back to an empty Set if the
 * RPC is missing (fresh checkout pre-migration).
 */
async function loadTrustedSellerIds(
  pool: Auction[],
): Promise<Set<string>> {
  const ids = Array.from(
    new Set(pool.map((a) => a.seller.id).filter(Boolean)),
  );
  if (ids.length === 0) return new Set();
  const priorities = await getSellerSearchPriorities(ids);
  const out = new Set<string>();
  for (const [sellerId, p] of priorities) {
    if (p.hasTrustedSellerBadge) out.add(sellerId);
  }
  return out;
}

/**
 * Pinned-pro home rail. Looks up the auction IDs from a Diamond-plan
 * RPC and resolves them via the live auctions pool (cached). Anything
 * not in the pool (e.g. just-listed and not yet picked up by the rail
 * queries) is fetched lazily via getLiveAuctionsCached so the rail
 * stays fresh.
 */
async function loadPinnedProAuctions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  alreadyKnown: Auction[],
): Promise<Auction[]> {
  const { data, error } = await supabase.rpc("home_pinned_pro_auctions", {
    p_limit: 6,
  });
  if (error || !Array.isArray(data) || data.length === 0) return [];
  const ids = new Set<string>(
    (data as Array<{ auction_id: string }>)
      .map((r) => r.auction_id)
      .filter(Boolean),
  );
  const byId = new Map<string, Auction>(alreadyKnown.map((a) => [a.id, a]));
  const matched = Array.from(ids)
    .map((id) => byId.get(id))
    .filter((a): a is Auction => Boolean(a));
  // If we found all from the live pool, return. Otherwise fall through
  // to the full live cache.
  if (matched.length === ids.size) return matched;
  const live = await getLiveAuctionsCached();
  const liveById = new Map<string, Auction>(live.map((a) => [a.id, a]));
  return Array.from(ids)
    .map((id) => liveById.get(id))
    .filter((a): a is Auction => Boolean(a));
}

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
