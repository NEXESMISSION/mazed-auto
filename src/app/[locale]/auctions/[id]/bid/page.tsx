import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById, listRecentBids } from "@/lib/db";
import { auctionCode } from "@/lib/format";
import { BidComposer } from "@/components/auction/BidComposer";
import { AuctionEndModal } from "@/components/auction/AuctionEndModal";
import { DesktopBidHero } from "@/components/auction/DesktopBidHero";
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
  // Authoritative KYC status — read from the `sellers` row (set by
  // `review_kyc` RPC), NOT from user_metadata.kycStatus. The metadata
  // can lag behind the DB until the next JWT refresh, and a malicious
  // user can self-set kycStatus="verified" in their JWT. This source
  // can only be flipped to true by the admin-only `review_kyc` RPC.
  let kycVerified = false;
  if (user) {
    const [depositRes, kycRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("auction_id", id)
        .eq("type", "deposit")
        .eq("status", "completed")
        .limit(1),
      supabase
        .from("sellers")
        .select("verified_kyc")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    initialDepositPaid = (depositRes.data ?? []).length > 0;
    kycVerified = Boolean(kycRes.data?.verified_kyc);
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

  // Sellers viewing their own auction don't need the dead-end "you can't bid"
  // gate — the detail page already shows everything they care about, plus a
  // calm link to /seller/auctions/[id]. Send them there.
  if (user && auction.seller.id === user.id) {
    redirect({ href: `/auctions/${id}`, locale });
  }

  // The user is "in" the auction (cleared every gate) iff:
  //  - signed in
  //  - not the seller
  //  - KYC verified (sellers.verified_kyc — authoritative, not JWT cache)
  //  - deposit paid
  // Bid history is only rendered for users who are in — for everyone else
  // it would just be a tease distracting from the "complete this step" CTA.
  const userIsBidder =
    !!user &&
    user.id !== auction.seller.id &&
    kycVerified &&
    initialDepositPaid === true;

  return (
    <div className="min-h-screen bg-background">
      {/* ============================================================
          MOBILE header — slim sticky bar with back + title.
          ============================================================ */}
      <header className="lg:hidden sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0e0e0e] border-b border-[var(--border)] flex items-center px-4 gap-3">
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

      {/* ============================================================
          DESKTOP header — taller sticky bar. "Détails" pill on the
          start, big eyebrow + title in the middle, tracking code on
          the end. Reads like a cockpit, not a phone toolbar.
          ============================================================ */}
      <header className="hidden lg:block sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-[var(--max-w-wide)] mx-auto px-8 h-20 flex items-center gap-6">
          <Link
            href={`/auctions/${id}`}
            className="inline-flex items-center gap-2 h-10 ps-3 pe-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Détails
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
              Placer une enchère
            </div>
            <div className="mt-0.5 text-lg font-black truncate tracking-tight">
              {auction.vehicle.make} {auction.vehicle.model}{" "}
              <span className="text-[var(--foreground-muted)] font-light">
                {auction.vehicle.year}
              </span>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[var(--foreground-subtle)] tracking-[0.1em] tabular-nums shrink-0">
            {auctionCode(auction.id)}
          </span>
        </div>
      </header>

      {/* Pops once if the auction ends mid-bid — already realtime-aware */}
      <AuctionEndModal auction={auction} userId={user?.id ?? null} />

      {userIsBidder ? (
        // ============================================================
        // ACTIVE BID — user has cleared every gate. Render the composer
        // alongside live context + bid history.
        //
        // Mobile:  composer + history stack vertically (DOM order).
        // Desktop: 2-col grid where DesktopBidHero + history land on
        //          the start (lg:col-start-1) and the sticky composer
        //          on the end (lg:col-start-2). DOM order is composer
        //          first so mobile keeps the existing UX.
        // ============================================================
        <div className="max-w-[var(--max-w)] mx-auto px-4 pt-4 pb-10 space-y-5 lg:max-w-[var(--max-w-wide)] lg:px-8 lg:pt-10 lg:pb-16 lg:space-y-0 lg:grid lg:grid-cols-[1.4fr_440px] xl:grid-cols-[1.4fr_480px] lg:gap-10 xl:gap-12">
          {/* ── Composer (DOM 1, mobile-top, desktop-right) ── */}
          <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-[calc(5rem+1.5rem)] lg:self-start">
            <div className="lg:rounded-[24px] lg:bg-[var(--surface)] lg:ring-1 lg:ring-[var(--border)] lg:p-7 lg:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
              <BidComposer
                auction={auction}
                initialAction={action ?? null}
                initialDepositPaid={initialDepositPaid}
              />
            </div>
          </aside>

          {/* ── Vehicle hero + bid history (DOM 2, mobile-bottom, desktop-left) ── */}
          <div className="lg:col-start-1 lg:row-start-1 space-y-6 lg:space-y-8 min-w-0">
            {/* Desktop-only — vehicle hero + live stats card */}
            <div className="hidden lg:block">
              <DesktopBidHero initialAuction={auction} />
            </div>

            {/* Live bid history — both viewports. On desktop it's wrapped
                in a card; on mobile it stays transparent (matches the
                previous mobile UX exactly). */}
            <div className="lg:rounded-[var(--radius-md)] lg:bg-[var(--surface)] lg:border lg:border-[var(--border)] lg:p-6">
              <BidHistoryRealtime
                auctionId={auction.id}
                totalBids={auction.totalBids}
                initialBids={initialBids}
              />
            </div>
          </div>
        </div>
      ) : (
        // ============================================================
        // GATE — user has not cleared a gate (login / KYC / deposit /
        // own auction). The composer renders its own 2-col PreBidGate
        // layout on desktop, so the page wrapper just provides
        // breathing room around it.
        // ============================================================
        <div className="max-w-[var(--max-w)] mx-auto px-4 pt-4 pb-10 lg:max-w-[var(--max-w-wide)] lg:px-8 lg:pt-10 lg:pb-16">
          <BidComposer
            auction={auction}
            initialAction={action ?? null}
            initialDepositPaid={initialDepositPaid}
          />
        </div>
      )}
    </div>
  );
}
