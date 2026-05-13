"use client";

import { Link } from "@/i18n/navigation";
import {
  Clock,
  Gavel,
  Users,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  TrendingUp,
  LayoutDashboard,
} from "lucide-react";
import { Countdown } from "./Countdown";
import { AuctionResultBanner } from "./AuctionResultBanner";
import { BuyNowButton } from "./BuyNowButton";
import { VideoButton } from "./VideoButton";
import { AIAlerts } from "./AIAlerts";
import { useRealtimeAuction } from "@/lib/realtime";
import { useExpired } from "@/lib/useExpired";
import { auctionCode, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

const FINAL_STATUSES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

interface Props {
  initialAuction: Auction;
  hasBid: boolean;
  /** True when the signed-in user is the seller of this auction. Swaps the
   *  bid CTA for a non-scary "your auction" link to the seller dashboard. */
  isOwnAuction?: boolean;
  /** Mobile-only — shown above the live panel on mobile. */
  videoUrl?: string;
  videoPoster?: string;
}

/**
 * Owns every piece of UI on the auction detail page that has to react
 * in real time:
 *   - Status pill (active → ending → ended)
 *   - Current price (bumps as new bids land)
 *   - Bid + participant counters
 *   - Countdown band (live ticks + extends on anti-snipe)
 *   - Result banner (winner / loser / reserve-not-met / pending decision)
 *   - CTA stack (live ↔ ended swaps the buttons)
 *
 * Renders both layouts internally so the realtime subscription is
 * shared:
 *   - Mobile (<lg): bid pills + CTA stack inside the linear flow.
 *   - Desktop (lg+): redesigned sticky right sidebar with bigger
 *     typography, clearer hierarchy, and trust signals at the bottom.
 *
 * Mobile classes are unchanged from the previous design; the desktop
 * variant is the cleaner redesign.
 */
export function LiveAuctionPanel({
  initialAuction,
  hasBid,
  isOwnAuction = false,
  videoUrl,
  videoPoster,
}: Props) {
  // Single subscription shared by both layouts.
  const auction = useRealtimeAuction(initialAuction);
  const expired = useExpired(auction.endTime);

  const isFinal = FINAL_STATUSES.has(auction.status);
  const isLive =
    !expired && (auction.status === "active" || auction.status === "ending");
  const isOver = isFinal || expired;

  return (
    <>
      {/* ============================================================
          MOBILE — linear flow inside the page's mobile container.
          Hidden on lg+. Same shape it had before; just wired through
          the realtime subscription so the data ticks live.
          ============================================================ */}
      <div className="lg:hidden space-y-5">
        {isFinal ? (
          <AuctionResultBanner auction={auction} />
        ) : (
          isOver && <EndedNotice auction={auction} />
        )}

        {auction.alerts && auction.alerts.length > 0 && (
          <AIAlerts alerts={auction.alerts} />
        )}

        {isLive && <BidPills auction={auction} />}

        {isLive && !isOwnAuction && (
          <Link
            href={`/auctions/${auction.id}/bid`}
            className="block h-14 rounded-full gradient-gold text-black font-extrabold text-[15px] shadow-[var(--shadow-gold)] flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-transform"
          >
            <Gavel className="h-5 w-5" />
            {hasBid ? "Continuer l'enchère" : "Rejoindre l'enchère"}
          </Link>
        )}

        {isLive && isOwnAuction && <OwnAuctionCta auctionId={auction.id} />}

        {auction.buyNowPrice && isLive && !isOwnAuction && (
          <BuyNowButton auction={auction} />
        )}

        {/* Always render the video widget — it self-renders the
            "Aucune vidéo" placeholder when the seller didn't upload
            one. Hiding the slot entirely made users wonder if it
            failed to load. */}
        <VideoButton url={videoUrl} poster={videoPoster} />
      </div>

      {/* ============================================================
          DESKTOP — redesigned sticky right sidebar. Cleaner hierarchy:
          status → price → countdown → CTA → trust signals.
          ============================================================ */}
      <aside className="hidden lg:block sticky top-6 self-start space-y-5">
        {/* Result banner stacks above the sticky panel when the auction
            is in a final state — it's the most important thing to see. */}
        {isFinal && <AuctionResultBanner auction={auction} />}

        <div className="rounded-[24px] bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
          {/* ── Status row ── */}
          <div className="px-7 pt-6 pb-4 flex items-center justify-between">
            {isLive ? (
              <span className="inline-flex items-center gap-2 px-2.5 h-7 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-emerald-300">
                  En direct
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-2.5 h-7 rounded-full bg-red-500/15 ring-1 ring-red-500/40">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-red-300">
                  {isFinal ? "Terminée" : "À venir"}
                </span>
              </span>
            )}
            <span className="font-mono text-[10px] text-[var(--foreground-subtle)] tracking-[0.1em] tabular-nums">
              {auctionCode(auction.id)}
            </span>
          </div>

          {/* ── Price block — BIG number, the focal point ── */}
          <div className="px-7 pb-5">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
              {isFinal ? "Prix final" : "Prix actuel"}
            </div>
            <PriceDisplay value={auction.currentPrice} />

            <div className="mt-4 flex items-center gap-5 text-[12px] text-[var(--foreground-muted)]">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Gavel className="h-4 w-4 text-[var(--gold)]" />
                <span className="font-extrabold text-foreground">
                  {auction.totalBids}
                </span>
                {auction.totalBids === 1 ? "enchère" : "enchères"}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Users className="h-4 w-4 text-[var(--gold)]" />
                <span className="font-extrabold text-foreground">
                  {auction.totalParticipants}
                </span>
                {auction.totalParticipants === 1
                  ? "participant"
                  : "participants"}
              </span>
            </div>

            {/* Reserve indicator — visible only for auctions with a reserve.
                Live-aware: flips to green the moment the floor is met. */}
            {auction.reservePrice && isLive && (
              <div
                className={cn(
                  "mt-3 inline-flex items-center gap-2 px-2.5 h-7 rounded-full ring-1 text-[11px] font-bold",
                  auction.reserveMet
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : "bg-amber-500/15 text-amber-300 ring-amber-500/30",
                )}
              >
                {auction.reserveMet ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5" />
                )}
                Réserve {auction.reserveMet ? "atteinte" : "non atteinte"}
              </div>
            )}
          </div>

          {/* ── Countdown band — only when live ── */}
          {isLive && (
            <div className="px-7 py-5 bg-[var(--surface-2)] border-y border-[var(--border)] flex items-center gap-4">
              <span className="h-11 w-11 shrink-0 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center">
                <Clock className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
                  Temps restant
                </div>
                <Countdown
                  endTime={auction.endTime}
                  className="text-[22px] font-extrabold tabular-nums leading-tight mt-0.5"
                />
              </div>
            </div>
          )}

          {/* ── CTA stack ── */}
          <div className="p-7 space-y-3">
            {isLive ? (
              isOwnAuction ? (
                <>
                  <OwnAuctionCta auctionId={auction.id} />
                  <VideoButton url={videoUrl} poster={videoPoster} />
                </>
              ) : (
                <>
                  <Link
                    href={`/auctions/${auction.id}/bid`}
                    className="block h-14 rounded-full bg-[var(--gold)] text-black font-extrabold text-base shadow-[var(--shadow-gold)] flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-transform"
                  >
                    <Gavel className="h-5 w-5" />
                    {hasBid ? "Continuer l'enchère" : "Rejoindre l'enchère"}
                  </Link>

                  {auction.buyNowPrice && <BuyNowButton auction={auction} />}

                  <VideoButton url={videoUrl} poster={videoPoster} />
                </>
              )
            ) : isFinal ? (
              <div className="text-center text-sm text-[var(--foreground-muted)] py-2">
                Cette enchère est{" "}
                <span className="font-bold text-foreground">terminée</span>.
                <Link
                  href="/auctions"
                  className="block mt-3 text-[var(--gold)] font-bold hover:underline"
                >
                  Voir d&apos;autres enchères →
                </Link>
              </div>
            ) : (
              <div className="text-sm text-[var(--foreground-muted)] py-2 text-center">
                L&apos;enchère commence bientôt.
              </div>
            )}
          </div>

          {/* ── Trust signals footer — only when live, only when there's a
              bid action above. Keeps the user on rails about what their
              money does on this platform. ── */}
          {isLive && !isOwnAuction && (
            <div className="px-7 py-4 bg-[var(--surface-2)]/50 border-t border-[var(--border)] grid grid-cols-1 gap-2.5 text-[11px] text-[var(--foreground-muted)] leading-snug">
              <span className="inline-flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] mt-0.5 shrink-0" />
                Caution{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {formatPrice(auction.participationDeposit)}
                </span>{" "}
                — remboursée sous 24 h si vous ne gagnez pas
              </span>
              <span className="inline-flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 text-[var(--gold)] mt-0.5 shrink-0" />
                Anti-sniping : prolongation auto à la dernière minute
              </span>
            </div>
          )}
        </div>

        {/* AI alerts under the panel — quieter, but still visible. */}
        {auction.alerts && auction.alerts.length > 0 && (
          <AIAlerts alerts={auction.alerts} />
        )}
      </aside>
    </>
  );
}

/** Calm seller-side replacement for the bid CTA — same height/shape as
 *  the bidder button, but routes to the seller dashboard instead of
 *  the dead-end "you can't bid on your own auction" gate. */
function OwnAuctionCta({ auctionId }: { auctionId: string }) {
  return (
    <Link
      href={`/seller/auctions/${auctionId}`}
      className="block h-14 rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)] text-foreground font-extrabold text-[15px] flex items-center justify-center gap-2 hover:ring-[var(--gold-soft)] hover:text-[var(--gold)] transition-colors"
    >
      <LayoutDashboard className="h-5 w-5" />
      Tableau du vendeur
    </Link>
  );
}

/**
 * Big animated price display. Re-mounts the value via a key so the
 * tabular-nums shift is visible — gives a subtle "the price just moved"
 * cue without a heavy animation library.
 */
function PriceDisplay({ value }: { value: number }) {
  return (
    <div className="mt-1 text-[44px] xl:text-[52px] font-black tabular-nums leading-none gradient-gold-text">
      <span key={value} className="inline-block animate-fade-in">
        {formatPrice(value)}
      </span>
    </div>
  );
}

/** Mobile bid-pills — same component as before, takes a live auction. */
function BidPills({ auction }: { auction: Auction }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3.5">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-subtle)]">
          Prix actuel
        </div>
        <div className="mt-1.5 text-lg font-extrabold tabular-nums leading-none gradient-gold-text">
          <span key={auction.currentPrice} className="inline-block animate-fade-in">
            {formatPrice(auction.currentPrice)}
          </span>
        </div>
        <div className="text-[10px] text-[var(--foreground-muted)] mt-2 tabular-nums">
          {auction.totalBids} {auction.totalBids === 1 ? "offre" : "offres"} ·{" "}
          {auction.totalParticipants}{" "}
          {auction.totalParticipants === 1 ? "participant" : "participants"}
        </div>
      </div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3.5">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-subtle)]">
          Se termine dans
        </div>
        <div className="mt-1.5">
          <Countdown
            endTime={auction.endTime}
            size="md"
            withIcon={false}
            className="text-lg leading-none"
          />
        </div>
        <div className="text-[10px] text-[var(--foreground-muted)] mt-2 inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
          En direct
        </div>
      </div>
    </div>
  );
}

/** Mirror of the page's EndedNotice — kept here because the live panel
 *  owns the "auction has flipped to ended" state transition. */
function EndedNotice({ auction }: { auction: Auction }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center shrink-0">
        <XCircle className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-red-200">
          Cette enchère est terminée
        </div>
        <div className="text-xs text-red-200/70 mt-0.5">
          Prix final :{" "}
          <span className="font-bold tabular-nums">
            {formatPrice(auction.currentPrice)}
          </span>{" "}
          · {auction.totalBids}{" "}
          {auction.totalBids === 1 ? "offre" : "offres"}
        </div>
      </div>
    </div>
  );
}
