import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ChevronLeft,
  Check,
  Crown,
  Gavel,
  Users,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Countdown } from "@/components/auction/Countdown";
import { SpecsGrid } from "@/components/auction/SpecsGrid";
import { AnonSellerCard } from "@/components/auction/AnonSellerCard";
import { ReportButton } from "@/components/auction/ReportButton";
import { FavoriteButton } from "@/components/auction/FavoriteButton";
import { ShareButton } from "@/components/auction/ShareButton";
import { AuctionResultBanner } from "@/components/auction/AuctionResultBanner";
import { AuctionEndModal } from "@/components/auction/AuctionEndModal";
import { BuyNowButton } from "@/components/auction/BuyNowButton";
import { VideoButton } from "@/components/auction/VideoButton";
import { HeroCarousel } from "@/components/auction/HeroCarousel";
import { AIAlerts } from "@/components/auction/AIAlerts";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById } from "@/lib/db";
import { auctionCode, formatPrice } from "@/lib/format";
import type { Auction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

const FINAL = ["ended", "reserve_not_met", "cancelled", "pending_seller_decision"];

export default async function AuctionDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Sweep expired rows before reading so the CTA never lies.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore
  }

  const auction = await getAuctionById(supabase, id);
  if (!auction) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let hasBid = false;
  if (user) {
    const { count } = await supabase
      .from("bids")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("auction_id", id);
    hasBid = (count ?? 0) > 0;
  }

  const { vehicle, seller } = auction;
  const isFinal = FINAL.includes(auction.status);
  // Server component — Date.now() runs once per request, not during a
  // re-render, so the purity rule doesn't apply here.
  // eslint-disable-next-line react-hooks/purity
  const expired = auction.endTime.getTime() <= Date.now();
  const isLive =
    !expired &&
    (auction.status === "active" || auction.status === "ending");
  // Treat both the database-final status and a passed end-time as "over"
  // for display purposes — the end_expired_auctions sweep above flips the
  // status, but if it lagged for any reason we still want the page to
  // render a clear ended state instead of silently hiding the timer.
  const isOver = isFinal || expired;

  return (
    <AppShell noTopBar>
      <AuctionEndModal auction={auction} userId={user?.id ?? null} />

      {/* Full-bleed hero — auto-cycling fade carousel through every photo.
          Floating buttons + title overlay sit on top via children. */}
      <section className="relative">
        <HeroCarousel
          images={vehicle.imageUrls}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="h-[58vh] min-h-[440px] max-h-[560px]"
        >
          {/* Bottom gradient so the title overlay stays readable. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />
          {/* Top gradient so the floating top buttons stay readable. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

          {/* Top toolbar — back on the start, action cluster on the end.
              Keeping all chrome at the top frees the middle for carousel
              arrows and the bottom for the title overlay + stats. */}
          <div className="absolute top-4 inset-x-0 px-4 flex items-center justify-between z-20">
            <Link
              href="/auctions"
              aria-label="Retour"
              className="h-10 w-10 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white flex items-center justify-center hover:bg-black/65 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2 [&_button]:bg-black/45 [&_button]:backdrop-blur-md [&_button]:border-white/15 [&_button]:text-white [&_button]:hover:bg-black/65 [&_button]:hover:border-white/25 [&_button]:hover:text-white">
              <FavoriteButton
                auctionId={auction.id}
                size="md"
                className="bg-black/45 backdrop-blur-md border-white/15 text-white hover:bg-black/65"
              />
              <ShareButton
                title={`${vehicle.make} ${vehicle.model} ${vehicle.year} — Mazed Auto`}
                text={`Prix actuel : ${formatPrice(auction.currentPrice)}`}
                className="bg-black/45 backdrop-blur-md border-white/15 text-white hover:bg-black/65 hover:border-white/25 hover:text-white"
              />
              <ReportButton auctionId={auction.id} />
            </div>
          </div>

          {/* Title overlay — bottom-start corner. Adds an activity row
              (bids · participants) so users see how hot the auction is
              without scrolling to the price pills. */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-7 z-10">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isOver && (
                // Big unmistakable pill — same height as the title row,
                // glowing red, with a pulse so the user can't miss it
                // even with a quick scroll-by.
                <span className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-red-500 text-white text-[11px] font-extrabold uppercase tracking-[0.18em] shadow-[0_0_24px_rgba(239,68,68,0.7)]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
                    <span className="relative h-2 w-2 rounded-full bg-white" />
                  </span>
                  Enchère terminée
                </span>
              )}
              {auction.isVip && !isOver && (
                <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold uppercase tracking-[0.15em]">
                  <Crown className="h-2.5 w-2.5" />
                  VIP
                </span>
              )}
              {auction.isFeatured && !isOver && (
                <span className="inline-flex items-center px-2 h-5 rounded-full bg-white/15 text-white text-[10px] font-bold uppercase tracking-[0.15em]">
                  En vedette
                </span>
              )}
              {/* Public tracking code — small monospace pill so support
                  agents can identify the auction at a glance. */}
              <span className="inline-flex items-center px-2 h-5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white/85 text-[10px] font-bold font-mono tracking-[0.08em] tabular-nums">
                {auctionCode(auction.id)}
              </span>
            </div>
            <h1 className="text-white text-[26px] font-extrabold leading-[1.15] tracking-tight">
              {vehicle.make} {vehicle.model}
              <span className="block text-white/70 font-light text-[18px] mt-0.5">
                {vehicle.year} · {vehicle.color}
              </span>
            </h1>

            {/* Activity row — bids count + participants count */}
            <div className="mt-3 flex items-center gap-4 text-white/80 text-[13px] tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <Gavel className="h-4 w-4" />
                <span className="font-bold">{auction.totalBids}</span>
                <span className="text-white/55 text-[11px]">{auction.totalBids === 1 ? "enchère" : "enchères"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span className="font-bold">{auction.totalParticipants}</span>
                <span className="text-white/55 text-[11px]">{auction.totalParticipants === 1 ? "participant" : "participants"}</span>
              </span>
            </div>
          </div>
        </HeroCarousel>
      </section>

      <div className="px-4 pt-5 pb-4 space-y-5">
        {isFinal ? (
          <AuctionResultBanner auction={auction} />
        ) : (
          isOver && <EndedNotice auction={auction} />
        )}

        {/* Description — short paragraph with view-more behaviour via line clamp */}
        {vehicle.description && (
          <p className="text-[13px] leading-relaxed text-[var(--foreground-muted)] line-clamp-3">
            {vehicle.description}
          </p>
        )}

        {/* AI / trust alerts — live here on the detail page so the user can
            review them before committing to bid. The bid page itself stays
            bidding-only. */}
        {auction.alerts && auction.alerts.length > 0 && (
          <AIAlerts alerts={auction.alerts} />
        )}

        {/* Two-pill price/timer panel — only shown while the auction is
            live. Once it's over, AuctionResultBanner (rendered above)
            already explains the state, so we drop the EndedNotice card to
            avoid duplicating the same information twice on the page. */}
        {isLive && <BidPills auction={auction} />}

        {/* Big rounded primary CTA — full-width, blue-grey accent (gold remix) */}
        {isLive && (
          <Link
            href={`/auctions/${auction.id}/bid`}
            className="block h-14 rounded-full gradient-gold text-black font-extrabold text-[15px] shadow-[var(--shadow-gold)] flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-transform"
          >
            <Gavel className="h-5 w-5" />
            {hasBid ? "Continuer l'enchère" : "Rejoindre l'enchère"}
          </Link>
        )}

        {auction.buyNowPrice && isLive && <BuyNowButton auction={auction} />}

        {vehicle.videoUrl && (
          <VideoButton url={vehicle.videoUrl} poster={vehicle.imageUrls[0]} />
        )}

        {/* Specs */}
        <Section title="Spécifications">
          <SpecsGrid vehicle={vehicle} />
        </Section>

        {vehicle.features.length > 0 && (
          <Section title="Caractéristiques">
            <div className="flex flex-wrap gap-1.5">
              {vehicle.features.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs"
                >
                  <Check className="h-3 w-3 text-[var(--gold)]" />
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Vendeur">
          <AnonSellerCard seller={seller} />
        </Section>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Slim "Auction is over" banner used when the end-time has passed but the
 * end_expired_auctions sweep hasn't flipped the row's status to a final
 * state yet (so AuctionResultBanner doesn't kick in). Renders a clear,
 * unmistakable red notice so the page never silently hides the timer.
 */
function EndedNotice({ auction }: { auction: Auction }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center shrink-0">
        <Clock className="h-5 w-5" />
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

/**
 * Side-by-side pill panels for the live state — Starting Bid on the left,
 * countdown on the right. Two equal-height surfaces, subtle border, just
 * enough contrast to read like floating cards over the dark background.
 */
function BidPills({ auction }: { auction: Auction }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3.5">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-subtle)]">
          Prix actuel
        </div>
        <div className="mt-1.5 text-lg font-extrabold tabular-nums leading-none gradient-gold-text">
          {formatPrice(auction.currentPrice)}
        </div>
        <div className="text-[10px] text-[var(--foreground-muted)] mt-2 tabular-nums">
          {auction.totalBids} {auction.totalBids === 1 ? "offre" : "offres"} · {auction.totalParticipants} {auction.totalParticipants === 1 ? "participant" : "participants"}
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

