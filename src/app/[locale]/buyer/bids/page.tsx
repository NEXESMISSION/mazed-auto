import { Link } from "@/i18n/navigation";
import { Gavel } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Button } from "@/components/ui/Button";
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

export default async function BuyerBidsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell noTopBar>
        <ScreenHeader title="Mes enchères" backHref="/" />
        <div className="px-4 text-center py-16 space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
            <Gavel className="h-6 w-6" />
          </div>
          <div className="font-bold text-base">Connectez-vous</div>
          <p className="text-sm text-[var(--foreground-muted)]">
            pour voir vos enchères
          </p>
          <Link href="/login">
            <Button size="md">Connexion</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // Sweep expired auctions before reading so the buyer never sees a
  // bid sitting in "Actives" with a long-passed end_time.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore — the BidsTabs client also has a time-aware guard
  }

  const { data: rawBids } = await supabase
    .from("bids")
    .select("*")
    .eq("user_id", user.id)
    .order("placed_at", { ascending: false });

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
      <ScreenHeader title="Mes enchères" backHref="/" />
      <div className="px-4 pb-8 space-y-4 lg:max-w-[var(--max-w-app)] lg:mx-auto lg:px-6">
        <BidsTabs bids={bids} watchlist={watchlist} />
      </div>
    </AppShell>
  );
}
