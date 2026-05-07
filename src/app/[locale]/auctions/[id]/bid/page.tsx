import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById, listRecentBids } from "@/lib/db";
import { BidComposer } from "@/components/auction/BidComposer";
import { AuctionEndModal } from "@/components/auction/AuctionEndModal";
import { BidHistoryRealtime } from "./BidHistoryRealtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ action?: string }>;
}

const NON_BIDDABLE = new Set([
  "ended",
  "cancelled",
  "reserve_not_met",
  "pending_seller_decision",
  "pending_review",
  "scheduled",
]);

export default async function BidPage({ params, searchParams }: Props) {
  const { id, locale } = await params;
  const { action } = await searchParams;
  const supabase = await createClient();

  // Sweep expired auctions so a stale "active" row doesn't let us through.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore — RPC may not exist on some envs
  }

  const auction = await getAuctionById(supabase, id);
  if (!auction) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bid history seed (only used when user is in the auction)
  const initialBids = await listRecentBids(supabase, id, 8);

  // Deposit seed for this user — also drives whether the user is "in" the
  // auction (i.e. has cleared every gate to actually bid).
  let initialDepositPaid: boolean | undefined = undefined;
  if (user) {
    const { data } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("auction_id", id)
      .eq("type", "deposit")
      .eq("status", "completed")
      .limit(1);
    initialDepositPaid = (data ?? []).length > 0;
  }

  // Non-live auctions can't accept bids — bounce to the detail page where the
  // user sees the result banner instead of a dead bid composer. Also bounce
  // if the wall-clock has passed end_time even when the row hasn't been
  // updated yet.
  // eslint-disable-next-line react-hooks/purity
  const expired = auction.endTime.getTime() <= Date.now();
  if (expired || NON_BIDDABLE.has(auction.status)) {
    redirect({ href: `/auctions/${id}`, locale });
  }

  // The user is "in" the auction (cleared every gate) iff:
  //  - signed in
  //  - not the seller
  //  - KYC verified
  //  - deposit paid
  // Bid history is only rendered for users who are in — for everyone else
  // it would just be a tease distracting from the "complete this step" CTA.
  const meta = (user?.user_metadata ?? {}) as { kycStatus?: string };
  const userIsBidder =
    !!user &&
    user.id !== auction.seller.id &&
    meta.kycStatus === "verified" &&
    initialDepositPaid === true;

  return (
    <div className="min-h-screen bg-background">
      {/* Slim header — circle back + label */}
      <header className="sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0e0e0e] border-b border-[var(--border)] flex items-center px-4 gap-3">
        <Link
          href={`/auctions/${id}`}
          aria-label="Retour"
          className="h-9 w-9 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)] font-bold">
            Enchère
          </div>
          <div className="text-sm font-bold truncate">
            {auction.vehicle.make} {auction.vehicle.model} {auction.vehicle.year}
          </div>
        </div>
      </header>

      {/* Pops once if the auction ends mid-bid */}
      <AuctionEndModal auction={auction} userId={user?.id ?? null} />

      <div className="max-w-[var(--max-w)] mx-auto px-4 pt-4 pb-10 space-y-4">
        <BidComposer
          auction={auction}
          initialAction={action ?? null}
          initialDepositPaid={initialDepositPaid}
        />

        {/* Live bid history — only shown when the user is actually in the
            auction. For users still on a gate (login / KYC / deposit) we
            hide it; surfacing other people's bids while they're locked out
            of bidding turned out to feel like a tease. */}
        {userIsBidder && (
          <div className="pt-2">
            <BidHistoryRealtime
              auctionId={auction.id}
              totalBids={auction.totalBids}
              initialBids={initialBids}
            />
          </div>
        )}
      </div>
    </div>
  );
}
