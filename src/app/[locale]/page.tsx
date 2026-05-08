import { AppShell } from "@/components/layout/AppShell";
import { HomeHeader } from "@/components/home/HomeHeader";
import { NewestRibbon } from "@/components/home/NewestRibbon";
import { ContinueBiddingRail } from "@/components/home/ContinueBiddingRail";
import { RecommendedRail } from "@/components/home/RecommendedRail";
import { EndingSoonRail } from "@/components/home/EndingSoonRail";
import { VipRail } from "@/components/home/VipRail";
import { BrandSlider } from "@/components/home/BrandSlider";
import { FeaturedSellers } from "@/components/home/FeaturedSellers";
import { createClient } from "@/lib/supabase/server";
import { mapAuction } from "@/lib/db";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const POOL_LIMIT = 50;
const NEWEST_COUNT = 10;
const RAIL_COUNT = 6;

export default async function HomePage() {
  const supabase = await createClient();

  // Single batched fetch — every rail derives its data from this pool. Two
  // round trips total (auth + auctions) instead of the 6+ the per-rail
  // pattern was producing, which used to stall the page for tens of seconds.
  const [{ data: userResp }, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("auctions")
      .select("*, seller:sellers(*)")
      .in("status", ["active", "ending"])
      .order("created_at", { ascending: false })
      .limit(POOL_LIMIT),
  ]);

  const user = userResp?.user ?? null;
  const meta = (user?.user_metadata ?? {}) as {
    firstName?: string;
    kycStatus?: "none" | "pending" | "verified" | "rejected";
  };

  const pool: Auction[] = (rows ?? []).map((r) =>
    mapAuction(r as Parameters<typeof mapAuction>[0]),
  );

  // Optionally exclude auctions the user already bid on so the discovery
  // rails don't recommend what they're already engaged with.
  let bidIds = new Set<string>();
  if (user) {
    const { data: rawBids } = await supabase
      .from("bids")
      .select("auction_id")
      .eq("user_id", user.id);
    bidIds = new Set((rawBids ?? []).map((b) => b.auction_id).filter(Boolean));
  }

  // Slice the pool into rails. Each rail owns disjoint IDs so the same car
  // never shows in two places.
  const newest = pool.slice(0, NEWEST_COUNT);
  const newestIds = new Set(newest.map((a) => a.id));

  const remainder = pool.filter(
    (a) => !newestIds.has(a.id) && !bidIds.has(a.id),
  );

  const recommended = remainder.slice(0, RAIL_COUNT);
  const recommendedIds = new Set(recommended.map((a) => a.id));

  const endingSoon = remainder
    .filter((a) => !recommendedIds.has(a.id))
    .slice()
    .sort((a, b) => a.endTime.getTime() - b.endTime.getTime())
    .slice(0, RAIL_COUNT);
  const endingIds = new Set(endingSoon.map((a) => a.id));

  const vip = remainder
    .filter((a) => a.isFeatured && !recommendedIds.has(a.id) && !endingIds.has(a.id))
    .slice(0, RAIL_COUNT);

  return (
    <AppShell noTopBar>
      <HomeHeader
        signedIn={Boolean(user)}
        firstName={meta.firstName ?? ""}
        email={user?.email ?? ""}
        kycVerified={meta.kycStatus === "verified"}
      />
      <NewestRibbon items={newest} />
      {user && <ContinueBiddingRail userId={user.id} />}
      <RecommendedRail items={recommended} />
      <EndingSoonRail items={endingSoon} />
      <VipRail items={vip} />
      <BrandSlider pool={pool} />
      <FeaturedSellers />
    </AppShell>
  );
}
