"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Eye, Edit, X, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatPrice, formatTimeRemaining } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction, AuctionStatus } from "@/lib/types";
import { SellerDecisionCard } from "./SellerDecisionCard";

const tabs: {
  value: "active" | "pending" | "ended" | "cancelled";
  label: string;
}[] = [
  { value: "active", label: "Actives" },
  { value: "pending", label: "En modération" },
  { value: "ended", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
];

const statusBadge: Record<
  AuctionStatus,
  {
    label: string;
    variant: "success" | "warning" | "danger" | "info" | "default";
  }
> = {
  scheduled: { label: "Planifiée", variant: "info" },
  active: { label: "Active", variant: "success" },
  ending: { label: "Bientôt terminé", variant: "warning" },
  ended: { label: "Terminée", variant: "default" },
  cancelled: { label: "Annulée", variant: "danger" },
  pending_seller_decision: { label: "En attente de votre décision", variant: "warning" },
  reserve_not_met: { label: "Prix de réserve non atteint", variant: "warning" },
  pending_review: { label: "En cours de modération", variant: "warning" },
  re_offered: { label: "Re-proposée (gagnant a renoncé)", variant: "warning" },
};

export function SellerAuctionsList({ list }: { list: Auction[] }) {
  const [tab, setTab] = useState<
    "active" | "pending" | "ended" | "cancelled"
  >("active");

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Time-aware liveness check: covers the brief window between an
  // auction's end_time passing and end_expired_auctions flipping its
  // status. Without this, ended rows briefly appear in "Actives".
  const isLive = (a: Auction) =>
    (a.status === "active" || a.status === "ending") &&
    a.endTime.getTime() > now;
  const isExpiredButOpen = (a: Auction) =>
    (a.status === "active" || a.status === "ending") &&
    a.endTime.getTime() <= now;

  const counts = {
    active: list.filter(isLive).length,
    pending: list.filter((a) => a.status === "pending_review").length,
    ended: list.filter(
      (a) =>
        a.status === "ended" ||
        a.status === "reserve_not_met" ||
        isExpiredButOpen(a),
    ).length,
    cancelled: list.filter((a) => a.status === "cancelled").length,
  };

  const needsDecision = list.filter(
    (a) => a.status === "pending_seller_decision",
  );

  const filtered = list.filter((a) => {
    if (tab === "active") return isLive(a);
    if (tab === "pending") return a.status === "pending_review";
    if (tab === "ended")
      return (
        a.status === "ended" ||
        a.status === "reserve_not_met" ||
        isExpiredButOpen(a)
      );
    return a.status === "cancelled";
  });

  return (
    <>
      {needsDecision.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            <span className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 shrink-0">
              ⏳
            </span>
            <div>
              <div className="font-extrabold text-amber-200 leading-tight">
                {needsDecision.length === 1
                  ? "1 enchère attend votre décision"
                  : `${needsDecision.length} enchères attendent votre décision`}
              </div>
              <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                Vous n'êtes pas obligé de vendre — acceptez l'offre du plus haut enchérisseur ou refusez.
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {needsDecision.map((a) => (
              <SellerDecisionCard key={a.id} auction={a} />
            ))}
          </div>
        </div>
      )}

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

      {filtered.length === 0 ? (
        <div className="text-center py-16 lg:py-24 space-y-3">
          <div className="mx-auto h-14 w-14 lg:h-20 lg:w-20 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
            <Inbox className="h-7 w-7 lg:h-10 lg:w-10" />
          </div>
          <div className="font-bold lg:text-lg">Aucune enchère dans cette section</div>
          <p className="text-sm text-[var(--foreground-muted)] mt-1 max-w-md mx-auto">
            Elles apparaîtront ici dès qu&apos;elles seront disponibles
          </p>
        </div>
      ) : (
        <div className="space-y-3 lg:space-y-4">
          {filtered.map((a) => {
            const sb = statusBadge[a.status];
            return (
              <div
                key={a.id}
                className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] lg:ring-1 lg:ring-[var(--border)] lg:border-0 overflow-hidden lg:hover:ring-[var(--gold-soft)] lg:transition-colors"
              >
                {/* Mobile-shaped row + actions strip */}
                <div className="lg:hidden">
                  <div className="p-3 flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb(a.vehicle.imageUrls[0], { width: 220, quality: 65 })}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm line-clamp-1">
                            {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                          </div>
                          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                            {a.status === "ended"
                              ? "Terminé"
                              : `Se termine dans ${formatTimeRemaining(a.endTime)}`}
                          </div>
                        </div>
                        <Badge variant={sb.variant} size="sm">
                          {sb.label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <div>
                          <div className="text-[var(--foreground-muted)]">Prix actuel</div>
                          <div className="font-bold text-[var(--gold)]">
                            {formatPrice(a.currentPrice)}
                          </div>
                        </div>
                        <div className="text-start">
                          <div className="text-[var(--foreground-muted)]">Offres</div>
                          <div className="font-bold">{a.totalBids}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex border-t border-[var(--border)] divide-x divide-[var(--border)] divide-x-reverse">
                    <Link
                      href={`/seller/auctions/${a.id}`}
                      className="flex-1 py-2.5 text-center text-xs font-semibold hover:bg-[var(--surface-2)] flex items-center justify-center gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Voir
                    </Link>
                    {(a.status === "pending_review" || a.totalBids === 0) &&
                      a.status !== "ended" &&
                      a.status !== "cancelled" && (
                        <Link
                          href={`/seller/new/step-1?edit=${a.id}`}
                          className="flex-1 py-2.5 text-center text-xs font-semibold hover:bg-[var(--surface-2)] flex items-center justify-center gap-1.5"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Modifier
                        </Link>
                      )}
                    {(a.status === "active" || a.status === "ending") &&
                      a.totalBids === 0 && (
                        <Link
                          href={`/seller/auctions/${a.id}`}
                          className="flex-1 py-2.5 text-center text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10 flex items-center justify-center gap-1.5"
                        >
                          <X className="h-3.5 w-3.5" />
                          Annuler
                        </Link>
                      )}
                  </div>
                </div>

                {/* Desktop row — wider photo, inline stats, action chips */}
                <div className="hidden lg:flex items-stretch">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb(a.vehicle.imageUrls[0], { width: 480, quality: 70 })}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-56 xl:w-64 h-40 xl:h-44 object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0 p-6 xl:p-7 flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-xl xl:text-2xl font-extrabold tracking-tight leading-tight line-clamp-1">
                          {a.vehicle.make} {a.vehicle.model}{" "}
                          <span className="text-[var(--foreground-muted)] font-light">
                            {a.vehicle.year}
                          </span>
                        </h3>
                        <div className="mt-1.5 text-[13px] text-[var(--foreground-muted)] flex items-center gap-2 flex-wrap">
                          {a.vehicle.color && <span>{a.vehicle.color}</span>}
                          {a.vehicle.mileage > 0 && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
                              <span>
                                {Intl.NumberFormat("fr-TN").format(
                                  a.vehicle.mileage,
                                )}{" "}
                                km
                              </span>
                            </>
                          )}
                          <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
                          <span>
                            {a.status === "ended"
                              ? "Terminé"
                              : `Se termine dans ${formatTimeRemaining(a.endTime)}`}
                          </span>
                        </div>
                      </div>
                      <Badge variant={sb.variant} size="lg" className="shrink-0">
                        {sb.label}
                      </Badge>
                    </div>

                    <div className="flex items-end justify-between gap-6">
                      <div className="flex items-end gap-7">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                            Prix actuel
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums leading-none gradient-gold-text">
                            {formatPrice(a.currentPrice)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                            Offres
                          </div>
                          <div className="mt-1 text-2xl font-black tabular-nums leading-none">
                            {a.totalBids}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/seller/auctions/${a.id}`}
                          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--gold)] text-black font-extrabold text-[12px] shadow-[var(--shadow-gold)] hover:scale-[1.02] transition-transform"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Voir l&apos;activité
                        </Link>
                        {(a.status === "pending_review" || a.totalBids === 0) &&
                          a.status !== "ended" &&
                          a.status !== "cancelled" && (
                            <Link
                              href={`/seller/new/step-1?edit=${a.id}`}
                              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-[12px] font-bold transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Modifier
                            </Link>
                          )}
                        {(a.status === "active" || a.status === "ending") &&
                          a.totalBids === 0 && (
                            <Link
                              href={`/seller/auctions/${a.id}`}
                              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full ring-1 ring-red-500/30 text-red-300 hover:bg-red-500/10 text-[12px] font-bold transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                              Annuler
                            </Link>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
