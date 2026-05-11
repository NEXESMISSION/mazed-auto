"use client";

import { Link } from "@/i18n/navigation";
import {
  Clock,
  Gauge,
  Gavel,
  Users,
  ExternalLink,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Countdown } from "./Countdown";
import { useRealtimeAuction } from "@/lib/realtime";
import { useExpired } from "@/lib/useExpired";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";
import type { Auction } from "@/lib/types";

interface Props {
  initialAuction: Auction;
}

/**
 * Desktop-only context card for the bid page. Shows what the user is
 * bidding on at a glance — vehicle photo + title + key stats — with
 * every dynamic field wired through realtime so the price/bid count/
 * countdown stay in sync with the right-side composer.
 *
 * Subscribes via the same `useRealtimeAuction` hook as the composer,
 * so the two panels react to the same row updates without one
 * displaying stale data while the other ticks.
 */
export function DesktopBidHero({ initialAuction }: Props) {
  const auction = useRealtimeAuction(initialAuction);
  const expired = useExpired(auction.endTime);
  const { vehicle } = auction;
  const isOver = expired || ["ended", "reserve_not_met", "cancelled"].includes(auction.status);

  return (
    <div className="space-y-6">
      {/* Photo card — large, contained, not full-bleed */}
      <Link
        href={`/auctions/${auction.id}`}
        className="group relative block overflow-hidden rounded-[28px] ring-1 ring-[var(--border)] hover:ring-[var(--gold-soft)] transition-all aspect-[4/3]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(vehicle.imageUrls[0], { width: 1200, quality: 75 })}
          alt={`${vehicle.make} ${vehicle.model}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" />

        {/* Top-end — see full details link */}
        <span className="absolute top-4 end-4 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
          Voir les détails
          <ExternalLink className="h-3.5 w-3.5" />
        </span>

        {/* Top-start — live indicator */}
        <span className="absolute top-4 start-4 inline-flex items-center gap-2 px-3 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            En direct
          </span>
        </span>

        {/* Bottom — title + key stats overlay */}
        <div className="absolute inset-x-0 bottom-0 p-6 xl:p-7">
          <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)] mb-2">
            Vous enchérissez sur
          </div>
          <h1 className="text-3xl xl:text-4xl font-black text-white leading-[1.05] tracking-tight">
            {vehicle.make} {vehicle.model}
          </h1>
          <div className="mt-2 text-base text-white/75 font-light flex items-center gap-3 flex-wrap">
            <span>{vehicle.year}</span>
            {vehicle.color && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span>{vehicle.color}</span>
              </>
            )}
            {vehicle.mileage > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="h-4 w-4" />
                  {Intl.NumberFormat("fr-TN").format(vehicle.mileage)} km
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      {/* Live stats panel — mirrors the composer so the user can verify
          they're acting on the freshest data. */}
      <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        {/* Price + countdown row */}
        <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
              Prix actuel
            </div>
            <div className="mt-1.5 text-3xl xl:text-4xl font-black tabular-nums leading-none gradient-gold-text">
              <span
                key={auction.currentPrice}
                className="inline-block animate-fade-in"
              >
                {formatPrice(auction.currentPrice)}
              </span>
            </div>
          </div>
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-muted)] inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[var(--gold)]" />
              {isOver ? "Statut" : "Temps restant"}
            </div>
            <div className="mt-1.5">
              {isOver ? (
                <div className="text-2xl font-black text-red-400 leading-none">
                  Terminée
                </div>
              ) : (
                <Countdown
                  endTime={auction.endTime}
                  size="xl"
                  withIcon={false}
                  className="text-2xl xl:text-[28px] leading-none tabular-nums"
                />
              )}
            </div>
          </div>
        </div>

        {/* Activity row */}
        <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
          <Stat Icon={Gavel} value={auction.totalBids} label={auction.totalBids === 1 ? "enchère" : "enchères"} />
          <Stat Icon={Users} value={auction.totalParticipants} label={auction.totalParticipants === 1 ? "participant" : "participants"} />
          <div className="p-4 flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center shrink-0">
              <span className="font-mono text-[10px] tracking-[0.05em]">#</span>
            </span>
            <div className="min-w-0">
              <div className="text-base font-extrabold tabular-nums leading-tight font-mono">
                {auctionCode(auction.id)}
              </div>
              <div className="text-[11px] text-[var(--foreground-muted)] leading-tight">
                Code de suivi
              </div>
            </div>
          </div>
        </div>

        {/* Reserve indicator — only if there's a reserve */}
        {auction.reservePrice && (
          <div
            className={cn(
              "p-4 flex items-center gap-3",
              auction.reserveMet
                ? "bg-emerald-500/5"
                : "bg-amber-500/5",
            )}
          >
            <span
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                auction.reserveMet
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300",
              )}
            >
              {auction.reserveMet ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-extrabold leading-tight">
                Réserve {auction.reserveMet ? "atteinte" : "non atteinte"}
              </div>
              <div className="text-[11px] text-[var(--foreground-muted)] leading-tight mt-0.5">
                {auction.reserveMet
                  ? "Le prix actuel sera respecté à la fin de l'enchère"
                  : "L'enchère sera soumise à la décision du vendeur si elle se termine sous ce seuil"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  Icon,
  value,
  label,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="p-4 flex items-center gap-3">
      <span className="h-9 w-9 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-extrabold tabular-nums leading-tight">
          {value}
        </div>
        <div className="text-[11px] text-[var(--foreground-muted)] leading-tight">
          {label}
        </div>
      </div>
    </div>
  );
}
