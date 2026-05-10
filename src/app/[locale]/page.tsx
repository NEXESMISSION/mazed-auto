import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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

      {/* Mobile-only PromoBanner. Desktop has its own hero below. */}
      <div className="lg:hidden">
        <PromoBanner pool={livePool} />
      </div>

      {/* DESKTOP-only editorial hero — magazine-style: 1 big featured card +
          3 secondary stacked cards. Replaces PromoBanner on lg+. */}
      <DesktopHero hot={hot} ending={endingSoon} />

      <div className="lg:max-w-[var(--max-w-wide)] lg:mx-auto">
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
      </div>
    </AppShell>
  );
}

/** Desktop-only editorial hero — only renders on lg+. */
function DesktopHero({
  hot,
  ending,
}: {
  hot: Auction[];
  ending: Auction[];
}) {
  // Take 4 distinct auctions: 1 hero + 3 runners-up.
  const featured = hot[0];
  if (!featured) return null;
  const runners = (hot.slice(1, 4).length === 3
    ? hot.slice(1, 4)
    : [...hot.slice(1), ...ending].filter((a) => a.id !== featured.id).slice(0, 3));
  if (runners.length < 3) return null;

  return (
    <section className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 mt-7">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            Mazed Auto · Sélection
          </div>
          <h1 className="mt-2 text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
            Les voitures qui font <span className="gradient-gold-text">monter les enchères</span>
          </h1>
        </div>
        <Link
          href="/auctions"
          className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.99] transition-transform shrink-0"
        >
          Parcourir tout
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-5">
        {/* Big featured */}
        <Link
          href={`/auctions/${featured.id}`}
          className="group relative rounded-2xl overflow-hidden ring-1 ring-[var(--border)] hover:ring-[var(--gold)] transition-all aspect-[16/10]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={featured.vehicle.imageUrls[0]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-6 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              À la une · La plus disputée
            </div>
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight">
              {featured.vehicle.make} {featured.vehicle.model}
              <span className="block text-white/70 font-light text-xl mt-1">
                {featured.vehicle.year} · {featured.vehicle.color}
              </span>
            </h2>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/70">
                  Prix actuel
                </div>
                <div className="text-3xl font-black gradient-gold-text tabular-nums">
                  {/* formatPrice imported on the route already */}
                  {new Intl.NumberFormat("fr-TN", {
                    style: "currency",
                    currency: "TND",
                    maximumFractionDigits: 0,
                  }).format(featured.currentPrice)}
                </div>
              </div>
              <span className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] group-hover:scale-[1.02] transition-transform">
                Voir l&apos;enchère →
              </span>
            </div>
          </div>
        </Link>

        {/* Runners stacked */}
        <div className="grid grid-rows-3 gap-5">
          {runners.map((a) => (
            <Link
              key={a.id}
              href={`/auctions/${a.id}`}
              className="group relative rounded-2xl overflow-hidden ring-1 ring-[var(--border)] hover:ring-[var(--gold)] transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.vehicle.imageUrls[0]}
                alt=""
                className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="relative h-full min-h-[110px] flex items-end p-4">
                <div className="space-y-1">
                  <div className="text-base font-extrabold text-white leading-tight">
                    {a.vehicle.make} {a.vehicle.model}{" "}
                    <span className="font-light text-white/70">
                      {a.vehicle.year}
                    </span>
                  </div>
                  <div className="text-[var(--gold)] font-bold tabular-nums text-sm">
                    {new Intl.NumberFormat("fr-TN", {
                      style: "currency",
                      currency: "TND",
                      maximumFractionDigits: 0,
                    }).format(a.currentPrice)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
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
