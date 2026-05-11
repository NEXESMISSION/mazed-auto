// Server-side TTL cache for the home page's rail data.
//
// Why not `unstable_cache` / `'use cache'`? The rail rows carry `Date`
// values (Auction.startTime/endTime/...). Next's cache serializes via
// JSON, which round-trips Date → string and breaks every consumer that
// calls `endTime.getTime()`. A simple module-scope TTL skips serialization
// entirely so the in-memory shape is preserved.
//
// In serverless this cache is per-worker, but even per-worker the win
// is huge: 6 parallel Supabase queries (~250-350ms total) collapse to
// ~1ms for every request that lands on a warm worker within the TTL.
// On self-hosted / always-on Node the cache is shared across all
// requests served by that instance.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listAuctions,
  listEndingSoon,
  listFeaturedLive,
  listHotNow,
  listNewestLive,
  listRecentlyEnded,
  seedActivityItems,
  type HotAuction,
} from "./db";
import { listCmsBanners, type CmsBanner } from "./cms";
import type { Auction } from "./types";

// Mirror of LiveActivityTicker's ActivityItem — duplicated here so the
// server module doesn't pull in a "use client" import. Shape matches
// seedActivityItems()'s return type.
type ActivityItem = Awaited<ReturnType<typeof seedActivityItems>>[number];

const RAIL_COUNT = 6;
const NEWEST_COUNT = 10;
const TTL_MS = 30_000;

export interface HomeRails {
  hot: HotAuction[];
  endingSoon: Auction[];
  newest: Auction[];
  vip: Auction[];
  recentlyEnded: Auction[];
  activitySeed: ActivityItem[];
  cmsBanners: CmsBanner[];
}

let cached: { at: number; data: HomeRails } | null = null;
let inflight: Promise<HomeRails> | null = null;

/**
 * Public-read Supabase client without cookies. Rail queries don't depend
 * on the user — RLS allows public read of live auctions / banners — so
 * we sidestep the cookie roundtrip and the per-request session refresh.
 */
function anonClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function fetchAll(): Promise<HomeRails> {
  const supa = anonClient();
  const [
    hot,
    endingSoon,
    newest,
    vip,
    recentlyEnded,
    activitySeed,
    cmsBanners,
  ] = await Promise.all([
    listHotNow(supa, RAIL_COUNT),
    listEndingSoon(supa, 24, RAIL_COUNT),
    listNewestLive(supa, 48, NEWEST_COUNT),
    listFeaturedLive(supa, RAIL_COUNT),
    listRecentlyEnded(supa, 72, RAIL_COUNT),
    seedActivityItems(supa, 8),
    listCmsBanners(supa),
  ]);
  return { hot, endingSoon, newest, vip, recentlyEnded, activitySeed, cmsBanners };
}

/**
 * Returns the home rails from cache when warm, or fetches + populates.
 * Concurrent callers during a cold read share one in-flight promise so
 * the worker only fires one batch per cache miss (no thundering herd).
 */
export async function getHomeRailsCached(): Promise<HomeRails> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await fetchAll();
      cached = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// ===== Browse page (full auctions list) =====
//
// Same pattern as home rails but for /auctions. Returns the unfiltered
// public list — client-side filters in AuctionsBrowser apply on top.

let auctionsCached: { at: number; data: Auction[] } | null = null;
let auctionsInflight: Promise<Auction[]> | null = null;

export async function getLiveAuctionsCached(): Promise<Auction[]> {
  const now = Date.now();
  if (auctionsCached && now - auctionsCached.at < TTL_MS) return auctionsCached.data;
  if (auctionsInflight) return auctionsInflight;

  auctionsInflight = (async () => {
    try {
      const data = await listAuctions(anonClient(), {});
      auctionsCached = { at: Date.now(), data };
      return data;
    } finally {
      auctionsInflight = null;
    }
  })();

  return auctionsInflight;
}
