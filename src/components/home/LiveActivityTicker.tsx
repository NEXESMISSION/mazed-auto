"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Gavel } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/format";
import { anonBidder } from "@/lib/anon";
import { DesktopArrowSlider } from "./DesktopArrowSlider";

export interface ActivityItem {
  id: string;
  auctionId: string | null;
  bidder: string;
  amount: number;
  vehicle: string;
  at: number;
}

interface AuctionMeta {
  make: string;
  model: string;
  year: number;
}

interface BidPayload {
  id: string;
  auction_id: string;
  // user_id is no longer projected to public consumers (round-21 audit
  // fix H-1) — kept optional in the payload type only because realtime
  // INSERT events on `bids` still carry the column for the row owner.
  user_id?: string | null;
  bidder_label: string | null;
  amount: number | string;
  placed_at: string;
}

interface RecentBid extends BidPayload {
  // Supabase aliases the joined column with the alias name we provide
  // (`auctions:auction_id(...)`), so this stays as `auctions`. The
  // toItem() helper reads from this same key.
  auctions: AuctionMeta | null;
}

const MAX_ITEMS = 8;

interface Props {
  /**
   * SSR-prefetched seed so the ticker paints with the very first frame
   * instead of popping in 1-2 seconds later when the client-side fetch
   * resolves. Server passes recent bids via `seedActivityItems` from
   * lib/db; client takes over with a realtime subscription on top.
   */
  initial?: ActivityItem[];
}

/**
 * Live "X just bid Y on Z" ticker on the home page. Subscribes to every
 * INSERT on `bids`, hydrates the auction make/model from a quick lookup,
 * and shows the most recent N events as a horizontally scrolling marquee
 * so the home feels actively alive (not a static catalogue page).
 */
export function LiveActivityTicker({ initial }: Props = {}) {
  // Hydrate immediately from SSR seed — never start with an empty list
  // when the server already had data; otherwise the section pops in
  // visibly after the realtime channel resolves, which feels broken.
  const [items, setItems] = useState<ActivityItem[]>(initial ?? []);
  const channelId = useId();
  const seenIds = useRef<Set<string>>(new Set(initial?.map((i) => i.id) ?? []));

  // If the SSR seed was empty (or undefined), do a single client fetch
  // so we still show something. Realtime takes over once at least one
  // INSERT lands.
  useEffect(() => {
    if ((initial?.length ?? 0) > 0) return;
    let cancelled = false;
    const supabase = createClient();

    async function seed() {
      // Read from the `public_bids` view — strips user_id so anonymous
      // home-page viewers can't deanonymise bidders.
      const { data } = await supabase
        .from("public_bids")
        .select(
          "id, auction_id, bidder_label, amount, placed_at, auctions:auction_id(make, model, year)",
        )
        .order("placed_at", { ascending: false })
        .limit(MAX_ITEMS);
      if (cancelled || !data) return;
      const seeded = (data as unknown as RecentBid[])
        .filter((b) => Boolean(b.auctions))
        .map((b) => toItem(b.auctions, b));
      seeded.forEach((s) => seenIds.current.add(s.id));
      setItems(seeded);
    }

    seed();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Live subscription — push every new bid to the head of the list.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-activity:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids" },
        async (payload) => {
          const bid = payload.new as BidPayload;
          if (seenIds.current.has(bid.id)) return;
          seenIds.current.add(bid.id);

          // Hydrate auction make/model — realtime payload only carries
          // the bid row.
          const { data: a } = await supabase
            .from("auctions")
            .select("make, model, year")
            .eq("id", bid.auction_id)
            .maybeSingle();
          if (!a) return;
          const item = toItem(a as AuctionMeta, bid);
          setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  if (items.length === 0) return null;

  // Duplicate the list so the CSS marquee can scroll seamlessly.
  const marquee = [...items, ...items];

  return (
    <section className="mt-5 lg:mt-14" aria-label="Activité en direct">
      {/* Mobile eyebrow */}
      <div className="lg:hidden px-4 mb-2 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          En direct
        </span>
        <span className="text-[10px] text-[var(--foreground-muted)]">
          ({items.length})
        </span>
      </div>

      {/* Desktop header — magazine style */}
      <div className="hidden lg:block px-8 mb-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              En direct · {items.length} mises
            </div>
            <h2 className="mt-1.5 text-3xl xl:text-4xl font-black tracking-tight">
              Le marché <span className="gradient-gold-text">en mouvement</span>
            </h2>
            <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
              Chaque enchère placée s&apos;affiche ici en temps réel
            </p>
          </div>
        </div>
        <div className="mt-5 h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />
      </div>

      {/* Mobile — CSS marquee, untouched */}
      <div className="lg:hidden marquee-viewport">
        <div className="marquee-track marquee-track--rapid px-3">
          {marquee.map((it, i) => (
            <Pill
              key={`${it.id}-${i}`}
              item={it}
              ariaHidden={i >= items.length}
            />
          ))}
        </div>
      </div>

      {/* Desktop — arrow slider with auto-advance */}
      <div className="hidden lg:block">
        <DesktopArrowSlider
          ariaLabel="Activité en direct"
          trackClassName="flex gap-3 px-6 pb-1"
          intervalMs={4500}
        >
          {marquee.map((it, i) => (
            <Pill
              key={`${it.id}-${i}-desk`}
              item={it}
              ariaHidden={i >= items.length}
            />
          ))}
        </DesktopArrowSlider>
      </div>
    </section>
  );
}

function Pill({
  item,
  ariaHidden,
}: {
  item: ActivityItem;
  ariaHidden?: boolean;
}) {
  return (
    <Link
      href={item.auctionId ? `/auctions/${item.auctionId}` : "/auctions"}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      className="shrink-0 me-3 lg:me-0 inline-flex items-center gap-2 px-3 lg:px-4 h-9 lg:h-11 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[12px] lg:text-[13px] hover:border-[var(--gold-soft)] transition-colors"
    >
      <Gavel className="h-3.5 w-3.5 text-[var(--gold)]" />
      <span className="font-bold text-foreground">{item.bidder}</span>
      <span className="text-[var(--foreground-muted)]">a misé</span>
      <span className="font-bold tabular-nums text-[var(--gold)]">
        {formatPrice(item.amount)}
      </span>
      <span className="text-[var(--foreground-muted)]">sur</span>
      <span className="font-semibold text-foreground line-clamp-1 max-w-[180px]">
        {item.vehicle}
      </span>
      <span className="text-[10px] text-[var(--foreground-subtle)] tabular-nums">
        {timeAgo(item.at)}
      </span>
    </Link>
  );
}

function toItem(meta: AuctionMeta | null, b: BidPayload): ActivityItem {
  // Prefer the per-auction bidder_label (e.g. "Acheteur #4") since
  // user_id is no longer publicly readable. Fall back to anonBidder
  // for the legacy realtime path that still carries user_id for the
  // bidder's own session.
  const bidder =
    b.bidder_label || (b.user_id ? anonBidder(b.user_id, 0) : "Enchérisseur");
  return {
    id: b.id,
    auctionId: b.auction_id,
    bidder,
    amount: Number(b.amount),
    vehicle: meta ? `${meta.make} ${meta.model} ${meta.year}` : "Une voiture",
    at: new Date(b.placed_at).getTime(),
  };
}

function timeAgo(ms: number): string {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  return `${Math.floor(hr / 24)} j`;
}
