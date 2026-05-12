import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow, type BidRow } from "@/lib/db";
import type { Auction } from "@/lib/types";
import { BidsTabs } from "./BidsTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface MyBid {
  auction: Auction;
  myBid: number;
  isWinning: boolean;
  /** Final payment recorded for this auction (bids the user won + buy-now). */
  finalPaid: boolean;
  /** Cached deposit amount (5% of starting price) — same source as the
   *  participationDeposit column on auctions. Surfaced here for the won
   *  tab's "remaining = winning bid - deposit" hint. */
  deposit: number;
}

export default async function BuyerBidsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The /buyer layout already redirects anonymous visitors to /login.
  // This is a defence-in-depth guard so the page can't render without a
  // user even if the layout is ever bypassed (e.g. during a route refactor).
  if (!user) {
    return redirect({ href: "/login?redirect=/buyer/bids", locale });
  }

  const t = await getTranslations({ locale, namespace: "buyer.bids" });

  // Sweep expired auctions before reading so the buyer never sees a
  // bid sitting in "Actives" with a long-passed end_time.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore — the BidsTabs client also has a time-aware guard
  }

  // Cap at 500 bids — a power bidder might place 100+ bids on a hot
  // auction, but anyone with more than 500 lifetime bids has older
  // ones that aren't worth surfacing on the "my bids" tab. The map
  // below dedupes by auction_id anyway, so what we care about is "the
  // most recent bid per auction the user participated in." 500 newest
  // bids on average covers ~150-300 unique auctions per active buyer.
  const { data: rawBids } = await supabase
    .from("bids")
    .select("id, auction_id, user_id, amount, placed_at, is_auto_bid")
    .eq("user_id", user.id)
    .order("placed_at", { ascending: false })
    .limit(500);

  const myBidByAuction = new Map<string, BidRow>();
  (rawBids ?? []).forEach((b) => {
    if (!myBidByAuction.has(b.auction_id)) {
      myBidByAuction.set(b.auction_id, b as BidRow);
    }
  });

  // Buy-now purchases also count as wins. Pull every auction the user
  // paid the final amount on so they show alongside auctions they bid on.
  const { data: paidTx } = await supabase
    .from("transactions")
    .select("auction_id")
    .eq("user_id", user.id)
    .eq("type", "final_payment")
    .eq("status", "completed");
  const paidAuctionIds = new Set(
    (paidTx ?? []).map((t) => t.auction_id).filter(Boolean) as string[],
  );

  let bids: MyBid[] = [];
  const allIds = new Set<string>([
    ...myBidByAuction.keys(),
    ...paidAuctionIds,
  ]);

  if (allIds.size > 0) {
    const ids = Array.from(allIds);
    const { data: auctions } = await supabase
      .from("auctions")
      .select("*, seller:sellers(*)")
      .in("id", ids);

    const { data: topBids } = await supabase
      .from("bids")
      .select("auction_id, user_id, amount, placed_at")
      .in("auction_id", ids)
      .order("amount", { ascending: false })
      .order("placed_at", { ascending: true });
    const topByAuction = new Map<string, { userId: string | null }>();
    (topBids ?? []).forEach((b) => {
      if (!topByAuction.has(b.auction_id)) {
        topByAuction.set(b.auction_id, { userId: b.user_id });
      }
    });

    bids = (auctions ?? []).map((row) => {
      const a = mapAuction(row as unknown as AuctionRow);
      const myBidRow = myBidByAuction.get(a.id);
      const myAmount = myBidRow ? Number(myBidRow.amount) : a.currentPrice;
      const ended =
        a.status === "ended" ||
        a.status === "reserve_not_met" ||
        a.status === "cancelled";
      const isWinning = ended
        ? paidAuctionIds.has(a.id) ||
          topByAuction.get(a.id)?.userId === user.id
        : myAmount >= a.currentPrice;
      return {
        auction: a,
        myBid: myAmount,
        isWinning,
        finalPaid: paidAuctionIds.has(a.id),
        deposit: a.participationDeposit,
      };
    });
  }

  // Watchlist (favorites) — folded into this page as a fourth tab so
  // the user has a single hub for "everything I've engaged with",
  // instead of jumping between /buyer/bids and /buyer/watchlist.
  let watchlist: Auction[] = [];
  const { data: wlRows } = await supabase
    .from("watchlist")
    .select("auction_id, auctions(*, seller:sellers(*))")
    .eq("user_id", user.id);
  watchlist = (wlRows ?? [])
    .map((r) =>
      r.auctions ? mapAuction(r.auctions as unknown as AuctionRow) : null,
    )
    .filter(Boolean) as Auction[];

  return (
    <AppShell noTopBar>
      {/* Mobile header */}
      <div className="lg:hidden">
        <ScreenHeader title={t("title")} backHref="/" />
      </div>

      {/* Desktop magazine header */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 pt-10 pb-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              <Gavel className="h-3.5 w-3.5" />
              {t("eyebrow")}
            </div>
            <h1 className="mt-2 text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
              {t("headlinePart1")}
              {t("headlinePart2") && (
                <>
                  {" "}
                  <span className="gradient-gold-text">{t("headlinePart2")}</span>
                </>
              )}
            </h1>
            <p className="mt-3 text-base text-[var(--foreground-muted)] max-w-2xl">
              {t("desktopSubtitle")}
            </p>
          </div>
          <Link
            href="/auctions"
            className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors"
          >
            <Gavel className="h-4 w-4" />
            {t("browseCta")}
          </Link>
        </div>
        <div className="mt-6 h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />
      </div>

      {/* Tabs + lists */}
      <div className="px-4 pb-8 space-y-4 lg:max-w-[var(--max-w-wide)] lg:mx-auto lg:px-8">
        <BidsTabs bids={bids} watchlist={watchlist} />
      </div>
    </AppShell>
  );
}
