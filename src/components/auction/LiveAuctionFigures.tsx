"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatTND } from "@/lib/utils";

/**
 * The live headline price on the auction DETAIL page.
 *
 * The detail page is a server component: it read current_price and bid_count
 * once, at render time, and then showed those frozen numbers under a pulsing
 * "En direct" dot for as long as the tab stayed open. On a hot lot the headline
 * could sit at the opening price while the real bidding ran tens of thousands
 * of dinars above it — the page LOOKED live and lied. (BidComposer, on /bid,
 * always had realtime; the detail page never did.)
 *
 * ONE live figure per page, on purpose: the price. Everything else on the
 * detail page (offer count, countdown, terms) stays server-rendered. A screen
 * where five numbers each update on their own schedule reads as broken even
 * when every one of them is right — and the number that actually decides
 * whether you bid is the price. The authoritative live surface is the BIDDING
 * page (BidComposer), which has realtime, its own poll, and now adopts every
 * fresh server render.
 *
 * The store below is keyed per auction, so mounting this twice (mobile +
 * desktop trees) still opens one subscription.
 *
 * Realtime is the fast path; a visibility-aware poll is the safety net (a
 * WebSocket blocked by a proxy, a dropped channel, a phone that slept through
 * the last twenty bids). Polling stops while the tab is hidden and does one
 * immediate catch-up read when it comes back.
 */

export type AuctionFigures = {
  price: number;
  bids: number;
  status: string;
};

type Store = {
  figures: AuctionFigures;
  listeners: Set<(f: AuctionFigures) => void>;
  stop: () => void;
};

const stores = new Map<string, Store>();

// Cadence: tight while the lot is hot, relaxed once nothing has happened for a
// while. Realtime normally beats the poll to every change, so this only has to
// be fast enough to cover an outage, not to drive the UI.
const POLL_HOT_MS = 5_000;
const POLL_COLD_MS = 20_000;
const HOT_WINDOW_MS = 60_000;
// Hidden tabs BACK OFF; they do not stop. Skipping entirely looked obviously
// right until a browser that renders the page while reporting
// visibilityState === "hidden" turned up (embedded webviews do this, and so
// does the in-app browser this was tested in) — there the price would have
// frozen forever, which is the exact bug this component exists to kill.
const POLL_HIDDEN_MS = 60_000;

function ensureStore(auctionId: string, seed: AuctionFigures): Store {
  const existing = stores.get(auctionId);
  if (existing) return existing;

  const store: Store = {
    figures: seed,
    listeners: new Set(),
    stop: () => {},
  };
  stores.set(auctionId, store);

  const publish = (next: Partial<AuctionFigures>) => {
    const merged = { ...store.figures, ...next };
    if (
      merged.price === store.figures.price &&
      merged.bids === store.figures.bids &&
      merged.status === store.figures.status
    ) {
      return;
    }
    store.figures = merged;
    for (const fn of store.listeners) fn(merged);
  };

  const supabase = getBrowserSupabase();
  let lastActivity = Date.now();
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // Through our own route, NOT a direct supabase read: an anonymous client
  // cannot select from `auctions` (its RLS policy touches `properties`, which
  // 0138 revoked from anon), so a browser poll would fail for precisely the
  // logged-out majority. See /api/auctions/[id]/figures.
  const poll = async () => {
    const res = await fetch(`/api/auctions/${auctionId}/figures`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { price: number; bids: number; status: string };
    const price = Number.isFinite(data.price) ? data.price : store.figures.price;
    const bids = Number.isFinite(data.bids) ? data.bids : store.figures.bids;
    if (price !== store.figures.price || bids !== store.figures.bids) {
      lastActivity = Date.now();
    }
    publish({ price, bids, status: data.status ?? store.figures.status });
  };

  const isHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const schedulePoll = () => {
    if (stopped || pollTimer) return;
    const hot = Date.now() - lastActivity < HOT_WINDOW_MS;
    const delay = isHidden() ? POLL_HIDDEN_MS : hot ? POLL_HOT_MS : POLL_COLD_MS;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      await poll().catch(() => {});
      schedulePoll();
    }, delay);
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void poll().catch(() => {});
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  const channel = supabase
    .channel(`auction-figures:${auctionId}`)
    .on(
      "postgres_changes" as unknown as never,
      {
        event: "UPDATE",
        schema: "public",
        table: "auctions",
        filter: `id=eq.${auctionId}`,
      } as never,
      (payload: {
        new: { current_price: number | null; bid_count: number | null; status: string };
      }) => {
        lastActivity = Date.now();
        const n = payload.new;
        publish({
          price: n.current_price != null ? Number(n.current_price) : store.figures.price,
          bids: n.bid_count != null ? Number(n.bid_count) : store.figures.bids,
          status: n.status ?? store.figures.status,
        });
      },
    )
    .on(
      "postgres_changes" as unknown as never,
      {
        event: "INSERT",
        schema: "public",
        table: "bids",
        filter: `auction_id=eq.${auctionId}`,
      } as never,
      () => {
        // A bid landed. Bump the counter on this very tick for instant feedback,
        // then reconcile the authoritative figures from the route — the UPDATE
        // event can lag, and for anonymous viewers it never arrives at all
        // (postgres_changes is RLS-filtered, and anon can't read auctions).
        lastActivity = Date.now();
        publish({ bids: store.figures.bids + 1 });
        void poll().catch(() => {});
      },
    )
    .subscribe();

  // Catch up IMMEDIATELY, before the first cadence tick. The server-rendered
  // seed comes from a 15s `unstable_cache` shell (getPublicAuctionDetail), so on
  // a busy lot the number in the HTML can already be several bids old by the
  // time it paints. One read on mount makes the first correct value appear right
  // away instead of up to a poll-interval later.
  void poll().catch(() => {});
  schedulePoll();

  store.stop = () => {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
    void supabase.removeChannel(channel);
    stores.delete(auctionId);
  };

  return store;
}

function useAuctionFigures(auctionId: string, seed: AuctionFigures): AuctionFigures {
  const [figures, setFigures] = useState<AuctionFigures>(seed);

  useEffect(() => {
    const store = ensureStore(auctionId, seed);
    // Adopt whatever the store already knows (another figure on the page may
    // have been subscribed for a while before this one mounted).
    setFigures(store.figures);
    store.listeners.add(setFigures);
    return () => {
      store.listeners.delete(setFigures);
      // Last consumer leaves → tear the subscription down, so navigating away
      // doesn't leave a socket and a timer running per auction visited.
      if (store.listeners.size === 0) store.stop();
    };
    // seed is only the initial value; re-running on a new object identity would
    // churn the subscription on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  return figures;
}

/** The headline current price, live. */
export function LivePrice({
  auctionId,
  initialPrice,
  initialBids,
  status,
  locale,
  className,
}: {
  auctionId: string;
  initialPrice: number;
  initialBids: number;
  status: string;
  locale: string;
  className?: string;
}) {
  const { price } = useAuctionFigures(auctionId, {
    price: initialPrice,
    bids: initialBids,
    status,
  });
  return <span className={className}>{formatTND(price, locale)}</span>;
}
