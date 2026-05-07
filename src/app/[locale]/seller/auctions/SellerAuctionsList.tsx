"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Eye, Edit, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatPrice, formatTimeRemaining } from "@/lib/format";
import type { Auction, AuctionStatus } from "@/lib/types";

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
};

export function SellerAuctionsList({ list }: { list: Auction[] }) {
  const [tab, setTab] = useState<
    "active" | "pending" | "ended" | "cancelled"
  >("active");

  const counts = {
    active: list.filter((a) => a.status === "active" || a.status === "ending")
      .length,
    pending: list.filter((a) => a.status === "pending_review").length,
    ended: list.filter(
      (a) => a.status === "ended" || a.status === "reserve_not_met",
    ).length,
    cancelled: list.filter((a) => a.status === "cancelled").length,
  };

  const needsDecision = list.filter(
    (a) => a.status === "pending_seller_decision",
  );

  const filtered = list.filter((a) => {
    if (tab === "active")
      return a.status === "active" || a.status === "ending";
    if (tab === "pending") return a.status === "pending_review";
    if (tab === "ended")
      return a.status === "ended" || a.status === "reserve_not_met";
    return a.status === "cancelled";
  });

  return (
    <>
      {needsDecision.length > 0 && (
        <div className="rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300">
              ⏳
            </span>
            <div>
              <div className="font-bold text-amber-200">
                {needsDecision.length} Enchère nécessite votre décision
              </div>
              <div className="text-xs text-[var(--foreground-muted)]">
                Enchères terminées avec prix de réserve non atteint. Vous avez 3 jours pour accepter ou refuser.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {needsDecision.map((a) => (
              <Link
                key={a.id}
                href={`/auctions/${a.id}`}
                className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] hover:border-amber-500/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)]">
                    Offre la plus haute : {formatPrice(a.currentPrice)} • Réserve :{" "}
                    {formatPrice(a.reservePrice ?? 0)}
                  </div>
                </div>
                <Button size="sm" variant="secondary">
Prendre une décision
                </Button>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 pb-2 px-3 -mb-px font-semibold text-sm transition-colors border-b-2 ${
              tab === t.value
                ? "text-[var(--gold)] border-[var(--gold)]"
                : "text-[var(--foreground-muted)] border-transparent hover:text-foreground"
            }`}
          >
            {t.label} ({counts[t.value]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
            <Inbox className="h-7 w-7" />
          </div>
          <div className="font-bold">Aucune enchère dans cette section</div>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Elles apparaîtront ici dès qu'elles seront disponibles
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const sb = statusBadge[a.status];
            return (
              <div
                key={a.id}
                className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
              >
                <div className="p-3 flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.vehicle.imageUrls[0]}
                    alt=""
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
                        <div className="text-[var(--foreground-muted)]">
                          Prix actuel
                        </div>
                        <div className="font-bold text-[var(--gold)]">
                          {formatPrice(a.currentPrice)}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-[var(--foreground-muted)]">
                          Offres
                        </div>
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
            );
          })}
        </div>
      )}
    </>
  );
}
