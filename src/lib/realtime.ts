"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type AuctionRow,
  type BidRow,
  type NotificationRow,
  type MessageRow,
  mapAuction,
  listRecentBids,
  listNotifications,
} from "@/lib/db";
import type { Auction } from "@/lib/types";

/**
 * Subscribe to a single auction row. Returns the latest version after
 * each Supabase realtime UPDATE (current_price, total_bids, end_time...).
 *
 * Each call gets its own channel name (via useId) so multiple instances
 * of the hook on the same page don't collide on the same channel.
 */
export function useRealtimeAuction(initial: Auction): Auction {
  const [auction, setAuction] = useState<Auction>(initial);
  const instanceId = useId();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`auction:${initial.id}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "auctions",
          filter: `id=eq.${initial.id}`,
        },
        (payload) => {
          const fresh = payload.new as AuctionRow;
          // Realtime payload omits the joined seller, so keep the existing
          // seller object — it doesn't change for an in-progress auction.
          setAuction((prev) =>
            mapAuction({ ...fresh, seller: prev.seller as never }),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initial.id, instanceId]);

  return auction;
}

/**
 * Subscribe to bid history for an auction. Initial list is fetched once,
 * then prepended with each new INSERT in realtime.
 *
 * `initial` (optional): server-rendered seed list so the page paints with
 * bids immediately instead of flashing "...".
 */
export function useRealtimeBids(
  auctionId: string,
  limit: number = 10,
  initial?: BidRow[],
) {
  const [bids, setBids] = useState<BidRow[]>(initial ?? []);
  const [loaded, setLoaded] = useState(initial !== undefined);
  const instanceId = useId();

  // Subscription effect — kept independent of `initial` so a fresh seed
  // arriving from the parent (e.g. SSR re-render) doesn't tear down the
  // realtime channel and re-subscribe. Re-subscribing on every seed
  // change burned a connection round-trip and briefly missed any bid
  // that landed in the gap.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bids:${auctionId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bids",
          filter: `auction_id=eq.${auctionId}`,
        },
        (payload) => {
          const row = payload.new as BidRow;
          setBids((prev) => {
            const merged = [row, ...prev];
            merged.sort((a, b) => {
              const da = Number(b.amount) - Number(a.amount);
              if (da !== 0) return da;
              return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
            });
            return merged.slice(0, limit);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, limit, instanceId]);

  // Seed sync — runs only when there's no SSR-provided seed. Replaced
  // with the freshly-fetched list. Independent of the subscription
  // effect, so it won't tear down the channel.
  useEffect(() => {
    if (initial !== undefined) return;
    const supabase = createClient();
    let cancelled = false;
    listRecentBids(supabase, auctionId, limit).then((rows) => {
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBids(rows);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [auctionId, limit, initial]);

  return { bids, loaded };
}

/**
 * Subscribe to a user's notification feed. Returns the list and an
 * `unread` count that updates as new notifications arrive or get marked read.
 *
 * `initial` (optional): server-rendered seed list so the page paints with
 * notifications immediately instead of flashing a loading state.
 */
export function useRealtimeNotifications(
  userId: string | null | undefined,
  initial?: NotificationRow[],
) {
  const [items, setItems] = useState<NotificationRow[]>(initial ?? []);
  const [loaded, setLoaded] = useState(initial !== undefined);
  const instanceId = useId();

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoaded(true);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    // Skip the initial fetch when seeded from the server — saves a roundtrip
    // and avoids a momentary "loaded" → "loaded again" flash.
    if (!initial) {
      listNotifications(supabase, userId).then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setLoaded(true);
        }
      });
    }

    const channel = supabase
      .channel(`notifs:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((prev) => [payload.new as NotificationRow, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as NotificationRow;
          setItems((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId, initial]);

  const unread = items.filter((n) => !n.is_read).length;

  return {
    items,
    unread: loaded ? unread : null,
    unreadCount: unread,
    loaded,
  };
}

/**
 * Subscribe to messages within one conversation. Initial list comes from the
 * server (SSR-rendered into the page); new INSERTs stream in via realtime.
 */
export function useRealtimeMessages(
  conversationId: string,
  initial: MessageRow[],
) {
  const [messages, setMessages] = useState<MessageRow[]>(initial);
  const instanceId = useId();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, instanceId]);

  return messages;
}

/** Subscribe to the whole list of active auctions on the catalog page. */
export function useRealtimeAuctionList(initial: Auction[]) {
  const [list, setList] = useState<Auction[]>(initial);
  const instanceId = useId();

  useEffect(() => {
    setList(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`auctions-feed:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auctions" },
        (payload) => {
          const fresh = payload.new as AuctionRow;
          setList((prev) =>
            prev.map((a) =>
              a.id === fresh.id
                ? mapAuction({ ...fresh, seller: a.seller as never })
                : a,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId]);

  return list;
}
