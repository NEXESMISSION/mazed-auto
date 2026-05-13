"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Gavel,
  Clock,
  Sparkles,
  ArrowRight,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { RateSellerButton } from "@/components/auction/RateSellerButton";
import { RenounceButton } from "../wins/RenounceButton";
import { formatPrice, formatTimeRemaining } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { anonSeller } from "@/lib/anon";
import type { Auction } from "@/lib/types";
import type { MyBid } from "./page";

const tabs = [
  { value: "active", label: "Actives" },
  { value: "watchlist", label: "Favoris" },
  { value: "won", label: "Gagnées" },
  { value: "lost", label: "Perdues" },
] as const;
type TabValue = (typeof tabs)[number]["value"];

export function BidsTabs({
  bids,
  watchlist = [],
}: {
  bids: MyBid[];
  watchlist?: Auction[];
}) {
  const params = useSearchParams();
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Time-aware liveness — covers the brief gap between an auction's
  // end_time passing and end_expired_auctions sweeping its status.
  // Without this, an auction the user sees as "Terminée" on the detail
  // page can still appear under Actives here for several seconds.
  const isLive = (b: MyBid) =>
    (b.auction.status === "active" || b.auction.status === "ending") &&
    b.auction.endTime.getTime() > now;
  const isOver = (b: MyBid) =>
    b.auction.status === "ended" ||
    b.auction.status === "reserve_not_met" ||
    b.auction.status === "cancelled" ||
    b.auction.status === "pending_seller_decision" ||
    ((b.auction.status === "active" || b.auction.status === "ending") &&
      b.auction.endTime.getTime() <= now);

  const counts = {
    active: bids.filter(isLive).length,
    watchlist: watchlist.length,
    won: bids.filter((b) => isOver(b) && b.isWinning).length,
    lost: bids.filter((b) => isOver(b) && !b.isWinning).length,
  };

  // Land on the most relevant tab. URL takes priority — `?tab=won` /
  // `?tab=watchlist` let the profile menu and old `/buyer/watchlist`
  // route deep-link straight into the right tab.
  const urlTab = params.get("tab");
  const validUrlTab: TabValue | null =
    urlTab && tabs.some((t) => t.value === urlTab) ? (urlTab as TabValue) : null;
  const fallbackTab: TabValue =
    counts.active > 0
      ? "active"
      : counts.won > 0
        ? "won"
        : counts.watchlist > 0
          ? "watchlist"
          : counts.lost > 0
            ? "lost"
            : "active";
  const [tab, setTab] = useState<TabValue>(validUrlTab ?? fallbackTab);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (validUrlTab && validUrlTab !== tab) setTab(validUrlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const filteredBids = bids.filter((b) => {
    if (tab === "active") return isLive(b);
    if (tab === "won") return isOver(b) && b.isWinning;
    if (tab === "lost") return isOver(b) && !b.isWinning;
    return false;
  });

  return (
    <>
      <div className="flex gap-2 lg:gap-1 overflow-x-auto hide-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 pb-2 lg:pb-3 px-3 lg:px-5 -mb-px font-semibold lg:font-bold text-sm lg:text-[15px] transition-colors border-b-2 ${
              tab === t.value
                ? "text-[var(--gold)] border-[var(--gold)]"
                : "text-[var(--foreground-muted)] border-transparent hover:text-foreground"
            }`}
          >
            {t.label}{" "}
            <span
              className={`ms-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] tabular-nums font-extrabold ${
                tab === t.value
                  ? "bg-[var(--gold)] text-black"
                  : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
              }`}
            >
              {counts[t.value]}
            </span>
          </button>
        ))}
      </div>

      {tab === "watchlist" ? (
        watchlist.length === 0 ? (
          renderEmpty(tab, counts, setTab)
        ) : (
          // Card grid for the watchlist — same component as the browse
          // grid. A compact list of MyBids would feel out of place here
          // since favourites carry no per-row "I bid X" data.
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-5 mt-2 lg:mt-4">
            {watchlist.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )
      ) : filteredBids.length === 0 ? (
        renderEmpty(tab, counts, setTab)
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:mt-4">
          {filteredBids.map((b) =>
            tab === "won" ? (
              <WinCard key={b.auction.id} bid={b} />
            ) : (
              <BidCard key={b.auction.id} bid={b} />
            ),
          )}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Active / Lost — compact bid card with re-bid CTA when applicable.
 * ------------------------------------------------------------------------- */
function BidCard({ bid: b }: { bid: MyBid }) {
  const live =
    b.auction.status === "active" || b.auction.status === "ending";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <Link
        href={`/auctions/${b.auction.id}`}
        className="flex gap-3 p-3 hover:bg-[var(--surface-2)] transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(b.auction.vehicle.imageUrls[0], { width: 220, quality: 65 })}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm line-clamp-1">
                {b.auction.vehicle.make} {b.auction.vehicle.model}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {statusLabel(b.auction.status, b.auction.endTime)}
              </div>
            </div>
            {b.isWinning ? (
              <Badge variant="success" size="sm">
                <TrendingUp className="h-3 w-3" />
                En tête
              </Badge>
            ) : (
              <Badge variant="danger" size="sm">
                <TrendingDown className="h-3 w-3" />
                Dépassé
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div>
              <div className="text-[var(--foreground-muted)]">
                Votre offre
              </div>
              <div className="font-bold tabular-nums">
                {formatPrice(b.myBid)}
              </div>
            </div>
            <div>
              <div className="text-[var(--foreground-muted)]">Prix actuel</div>
              <div
                className={`font-bold tabular-nums ${
                  b.isWinning
                    ? "text-[var(--success)]"
                    : "text-[var(--gold)]"
                }`}
              >
                {formatPrice(b.auction.currentPrice)}
              </div>
            </div>
          </div>
        </div>
      </Link>
      {!b.isWinning && live && (
        <div className="border-t border-[var(--border)] p-2">
          <Link href={`/auctions/${b.auction.id}/bid`}>
            <Button size="sm" fullWidth>
              Enchérir à nouveau
            </Button>
          </Link>
        </div>
      )}
      {!live && !b.isWinning && (
        <div className="border-t border-[var(--border)] p-2">
          <Button size="sm" fullWidth variant="secondary" disabled>
            {b.auction.status === "cancelled"
              ? "Enchère annulée"
              : b.auction.status === "reserve_not_met"
                ? "Prix de réserve non atteint"
                : b.auction.status === "pending_seller_decision"
                  ? "En attente de la décision du vendeur"
                  : "Enchère terminée"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Won — payment + renounce + rate (was its own /buyer/wins page).
 * ------------------------------------------------------------------------- */
function WinCard({ bid: w }: { bid: MyBid }) {
  const auctionLabel = `${w.auction.vehicle.make} ${w.auction.vehicle.model} ${w.auction.vehicle.year}`;
  const remaining = Math.max(0, w.myBid - w.deposit);
  return (
    <>
      {/* ============================================================
          MOBILE — original compact card, untouched.
          ============================================================ */}
      <div className="lg:hidden rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gold-soft)]/40 overflow-hidden shadow-[0_0_24px_rgba(212,175,55,0.08)]">
        <div className="flex gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(w.auction.vehicle.imageUrls[0], { width: 280, quality: 65 })}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <Trophy className="h-4 w-4 text-[var(--gold)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">{auctionLabel}</div>
                <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {anonSeller(w.auction.seller.id)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <div className="text-[var(--foreground-muted)]">
                  Votre offre gagnante
                </div>
                <div className="font-bold gradient-gold-text tabular-nums">
                  {formatPrice(w.myBid)}
                </div>
              </div>
              <div className="text-end">
                <div className="text-[var(--foreground-muted)]">
                  Statut du paiement
                </div>
                {w.finalPaid ? (
                  <Badge variant="success" size="sm">Payé</Badge>
                ) : w.auction.status === "re_offered" ? (
                  <Badge variant="warning" size="sm">Re-proposée à votre prix</Badge>
                ) : (
                  <Badge variant="warning" size="sm">En attente</Badge>
                )}
              </div>
            </div>
            {w.finalPaid && (
              <div className="mt-3 flex justify-end">
                <RateSellerButton
                  sellerId={w.auction.seller.id}
                  sellerName={anonSeller(w.auction.seller.id)}
                />
              </div>
            )}
          </div>
        </div>

        {!w.finalPaid && (
          <div className="border-t border-[var(--border)]">
            <div className="p-3 bg-amber-500/5">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                <Clock className="h-3.5 w-3.5" />
                Finalisez le paiement pour récupérer la voiture
              </div>
              <div className="text-xs text-[var(--foreground-muted)]">
                Montant restant : {formatPrice(remaining)} (après déduction de
                la caution {formatPrice(w.deposit)})
              </div>
            </div>
            <div className="p-3 flex flex-col sm:flex-row gap-2">
              <Link
                href={`/payment/checkout?type=final&auction=${w.auction.id}&amount=${remaining}`}
                className="flex-1"
              >
                <Button size="md" fullWidth>
                  Payer maintenant
                </Button>
              </Link>
              <RenounceButton
                auctionId={w.auction.id}
                deposit={w.deposit}
                auctionLabel={auctionLabel}
              />
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          DESKTOP — trophy magazine card. Big photo banner with trophy
          ribbon overlay, body with paid/unpaid state styled distinctly:
            - Paid:   subdued surface, "Notez le vendeur" CTA
            - Unpaid: amber accent strip + clear "Payer maintenant" + renounce
          ============================================================ */}
      <div className="hidden lg:block rounded-[24px] overflow-hidden ring-1 ring-[var(--gold-soft)]/40 bg-[var(--surface)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)]">
        {/* Banner — auction photo with trophy ribbon */}
        <Link
          href={`/auctions/${w.auction.id}`}
          className="relative block aspect-[16/7] overflow-hidden group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(w.auction.vehicle.imageUrls[0], { width: 900, quality: 70 })}
            alt={auctionLabel}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />

          {/* Top — trophy pill (won) + payment status */}
          <div className="absolute inset-x-0 top-0 p-5 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-[var(--gold)] text-black text-[11px] font-extrabold uppercase tracking-[0.18em] shadow-[var(--shadow-gold)]">
              <Trophy className="h-3.5 w-3.5" />
              Vous avez gagné
            </span>
            {w.finalPaid ? (
              <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 text-[11px] font-extrabold uppercase tracking-[0.15em] backdrop-blur-md">
                <Trophy className="h-3 w-3" />
                Payé
              </span>
            ) : w.auction.status === "re_offered" ? (
              <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 text-amber-300 text-[11px] font-extrabold uppercase tracking-[0.15em] backdrop-blur-md">
                Re-proposée
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 text-amber-300 text-[11px] font-extrabold uppercase tracking-[0.15em] backdrop-blur-md">
                <Clock className="h-3 w-3" />
                Paiement en attente
              </span>
            )}
          </div>

          {/* Bottom — title + seller */}
          <div className="absolute inset-x-0 bottom-0 p-6">
            <h3 className="text-2xl xl:text-3xl font-black text-white leading-tight tracking-tight">
              {w.auction.vehicle.make} {w.auction.vehicle.model}{" "}
              <span className="font-light text-white/70">
                {w.auction.vehicle.year}
              </span>
            </h3>
            <div className="mt-1 text-[13px] text-white/70 flex items-center gap-2 flex-wrap">
              <span>{anonSeller(w.auction.seller.id)}</span>
              {w.auction.vehicle.color && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  <span>{w.auction.vehicle.color}</span>
                </>
              )}
              {w.auction.vehicle.mileage > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  <span>
                    {Intl.NumberFormat("fr-TN").format(w.auction.vehicle.mileage)} km
                  </span>
                </>
              )}
            </div>
          </div>
        </Link>

        {/* Body — pricing summary + actions */}
        <div className="p-6 xl:p-7 space-y-5">
          {/* Pricing row */}
          <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-2xl bg-[var(--surface-2)]/40 ring-1 ring-[var(--border)] overflow-hidden">
            <Cell
              label="Votre offre gagnante"
              value={formatPrice(w.myBid)}
              tone="gold"
            />
            <Cell
              label="Caution (déduite)"
              value={`− ${formatPrice(w.deposit)}`}
              tone="muted"
            />
            <Cell
              label={w.finalPaid ? "Payé" : "Reste à payer"}
              value={
                w.finalPaid ? formatPrice(w.myBid) : formatPrice(remaining)
              }
              tone={w.finalPaid ? "success" : "amber"}
            />
          </div>

          {w.finalPaid ? (
            // Paid state — rate the seller
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 flex items-center justify-center">
                  <Trophy className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold leading-tight">
                    Paiement effectué
                  </div>
                  <div className="text-[12px] text-[var(--foreground-muted)] leading-tight mt-0.5">
                    Contactez le vendeur pour la livraison
                  </div>
                </div>
              </div>
              <RateSellerButton
                sellerId={w.auction.seller.id}
                sellerName={anonSeller(w.auction.seller.id)}
              />
            </div>
          ) : (
            // Unpaid state — amber call-out + payment CTA
            <>
              <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 p-4 flex items-start gap-3">
                <span className="h-9 w-9 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-amber-200 leading-tight">
                    Finalisez le paiement pour récupérer la voiture
                  </div>
                  <div className="text-[12px] text-[var(--foreground-muted)] leading-snug mt-1">
                    Montant restant{" "}
                    <span className="font-bold tabular-nums text-foreground">
                      {formatPrice(remaining)}
                    </span>{" "}
                    après déduction de la caution{" "}
                    <span className="tabular-nums">
                      {formatPrice(w.deposit)}
                    </span>
                    .
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href={`/payment/checkout?type=final&auction=${w.auction.id}&amount=${remaining}`}
                  className="flex-1 min-w-[200px]"
                >
                  <Button
                    size="md"
                    fullWidth
                    className="!h-12 lg:rounded-full lg:text-base"
                  >
                    Payer maintenant {formatPrice(remaining)}
                  </Button>
                </Link>
                <RenounceButton
                  auctionId={w.auction.id}
                  deposit={w.deposit}
                  auctionLabel={auctionLabel}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Small data cell inside the desktop WinCard pricing strip. */
function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "gold" | "muted" | "amber" | "success";
}) {
  const color: Record<typeof tone, string> = {
    gold: "gradient-gold-text",
    muted: "text-[var(--foreground-muted)]",
    amber: "text-amber-300",
    success: "text-emerald-300",
  };
  return (
    <div className="p-4 xl:p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div
        className={`mt-1.5 text-xl xl:text-2xl font-black tabular-nums leading-none ${color[tone]}`}
      >
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Empty states — designed, not boilerplate.
 * ------------------------------------------------------------------------- */
function renderEmpty(
  tab: TabValue,
  counts: {
    active: number;
    watchlist: number;
    won: number;
    lost: number;
  },
  setTab: (v: TabValue) => void,
) {
  if (tab === "watchlist") {
    return (
      <EmptyHero
        Icon={Heart}
        title="Aucun favori pour le moment"
        subtitle="Touchez le cœur sur une enchère pour la suivre — vous serez alerté juste avant la fin."
        primary={{ href: "/auctions", label: "Parcourir les enchères" }}
      />
    );
  }
  if (tab === "won") {
    return (
      <EmptyHero
        Icon={Trophy}
        title="Aucune vente gagnée pour le moment"
        subtitle="Quand vous remporterez une enchère elle apparaîtra ici, prête à payer."
        primary={{ href: "/auctions", label: "Parcourir les enchères" }}
      />
    );
  }
  if (tab === "lost") {
    return (
      <EmptyHero
        Icon={Sparkles}
        title="Aucune enchère perdue"
        subtitle="La chance est de votre côté — continuez."
        primary={{ href: "/auctions", label: "Parcourir les enchères" }}
      />
    );
  }
  // ACTIVE tab — branch by past activity so the message lands.
  if (counts.won + counts.lost > 0) {
    return (
      <EmptyHero
        Icon={Gavel}
        title="Aucune enchère active"
        subtitle={`Vous avez ${counts.won} ${counts.won === 1 ? "vente gagnée" : "ventes gagnées"} et ${counts.lost} ${counts.lost === 1 ? "enchère perdue" : "enchères perdues"} jusqu'ici.`}
        primary={{ href: "/auctions", label: "Parcourir les enchères" }}
        secondary={
          counts.won > 0
            ? { onClick: () => setTab("won"), label: "Voir mes gagnées" }
            : counts.lost > 0
              ? { onClick: () => setTab("lost"), label: "Voir mes perdues" }
              : undefined
        }
      />
    );
  }
  return (
    <EmptyHero
      Icon={Gavel}
      title="Vous n'avez encore rien enchéri"
      subtitle="Trouvez une voiture qui vous plaît et placez votre première offre — ça prend 30 secondes."
      primary={{ href: "/auctions", label: "Parcourir les enchères" }}
      secondary={{ href: "/how-it-works", label: "Comment ça marche" }}
    />
  );
}

interface EmptyHeroProps {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  primary?: { href: string; label: string };
  secondary?:
    | { href: string; label: string }
    | { onClick: () => void; label: string };
}

function EmptyHero({ Icon, title, subtitle, primary, secondary }: EmptyHeroProps) {
  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--gold-soft)]/30 bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[#1a1408] p-8 text-center space-y-5 relative overflow-hidden">
      {/* Soft gold halo behind the icon */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(212,175,55,0.18), transparent 70%)",
        }}
      />
      <div className="relative mx-auto h-16 w-16 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/40 flex items-center justify-center shadow-[var(--shadow-gold)]">
        <Icon className="h-7 w-7 text-[var(--gold)]" />
      </div>
      <div className="relative space-y-1.5 max-w-sm mx-auto">
        <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          {subtitle}
        </p>
      </div>
      <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 max-w-sm mx-auto">
        {primary && (
          <Link href={primary.href} className="flex-1">
            <Button size="lg" fullWidth>
              {primary.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
        {secondary &&
          ("href" in secondary ? (
            <Link href={secondary.href} className="flex-1">
              <Button size="lg" variant="ghost" fullWidth>
                {secondary.label}
              </Button>
            </Link>
          ) : (
            <Button
              size="lg"
              variant="ghost"
              fullWidth
              onClick={secondary.onClick}
              className="flex-1"
            >
              {secondary.label}
            </Button>
          ))}
      </div>
    </div>
  );
}

/**
 * Map the auction status to the short, user-facing label that should
 * appear under the title in a bid row. Auctions that have technically
 * passed their endTime but haven't been swept yet are treated as ended
 * so we never show "Se termine dans -2m" or similar broken output.
 *
 * Final outcomes get their own label so a user can tell at a glance
 * why their bid lost — "Réserve non atteinte" vs "Annulée" vs the
 * vendor still deciding.
 */
function statusLabel(
  status: Auction["status"],
  endTime: Date,
): string {
  if (status === "cancelled") return "Annulée";
  if (status === "reserve_not_met") return "Réserve non atteinte";
  if (status === "pending_seller_decision") return "En attente du vendeur";
  if (status === "ended") return "Terminée";
  // active / ending — but if the timer has actually passed, the sweep
  // hasn't run yet; show "Terminée" instead of a negative countdown.
  if (endTime.getTime() <= Date.now()) return "Terminée";
  return `Se termine dans ${formatTimeRemaining(endTime)}`;
}
