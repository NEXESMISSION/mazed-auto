"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { TrendingUp, TrendingDown, Trophy, Gavel } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatPrice, formatTimeRemaining } from "@/lib/format";
import type { MyBid } from "./page";

const tabs = [
  { value: "active", label: "Actives" },
  { value: "won", label: "Gagnées" },
  { value: "lost", label: "Perdues" },
] as const;

export function BidsTabs({ bids }: { bids: MyBid[] }) {
  const counts = {
    active: bids.filter(
      (b) => b.auction.status === "active" || b.auction.status === "ending",
    ).length,
    won: bids.filter((b) => b.auction.status === "ended" && b.isWinning).length,
    lost: bids.filter((b) => b.auction.status === "ended" && !b.isWinning)
      .length,
  };

  // Land on the most relevant tab. If the user has no active bids but does
  // have wins or losses, default to that tab so they don't see a confusing
  // "you haven't participated" message right after winning an auction.
  const defaultTab: (typeof tabs)[number]["value"] =
    counts.active > 0
      ? "active"
      : counts.won > 0
        ? "won"
        : counts.lost > 0
          ? "lost"
          : "active";
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>(defaultTab);

  const filtered = bids.filter((b) => {
    if (tab === "active")
      return b.auction.status === "active" || b.auction.status === "ending";
    if (tab === "won") return b.auction.status === "ended" && b.isWinning;
    return b.auction.status === "ended" && !b.isWinning;
  });

  return (
    <>
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
        tab === "won" ? (
          <EmptyState
            icon={<Trophy className="h-12 w-12 text-[var(--gold)] mx-auto" />}
            title="Aucune vente gagnée pour le moment"
            subtitle="Gagnez votre première enchère pour la voir ici"
          />
        ) : tab === "lost" ? (
          <EmptyState
            title="Aucune enchère perdue"
            subtitle="La chance est de votre côté"
          />
        ) : counts.won + counts.lost > 0 ? (
          // No active bids, but user has past activity — point them to it.
          <EmptyState
            icon={<Gavel className="h-10 w-10 text-[var(--gold)]" />}
            title="Aucune enchère active actuellement"
            subtitle={`Vous avez ${counts.won} ${counts.won === 1 ? "vente gagnée" : "ventes gagnées"} et ${counts.lost} ${counts.lost === 1 ? "enchère perdue" : "enchères perdues"}`}
            action={
              <div className="flex gap-2 justify-center">
                {counts.won > 0 && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setTab("won")}
                  >
                    <Trophy className="h-4 w-4" />
                    Voir les gagnées
                  </Button>
                )}
                <Link href="/auctions">
                  <Button size="md">Parcourir les enchères</Button>
                </Link>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<Gavel className="h-10 w-10 text-[var(--gold)]" />}
            title="Vous n'avez participé à aucune enchère"
            subtitle="Commencez à enchérir sur une voiture qui vous plaît"
            action={
              <Link href="/auctions">
                <Button size="md">Parcourir les enchères</Button>
              </Link>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div
              key={b.auction.id}
              className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
            >
              <Link
                href={`/auctions/${b.auction.id}`}
                className="flex gap-3 p-3 hover:bg-[var(--surface-2)] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.auction.vehicle.imageUrls[0]}
                  alt=""
                  className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm line-clamp-1">
                        {b.auction.vehicle.make} {b.auction.vehicle.model}
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                        {b.auction.status === "ended"
                          ? "Terminé"
                          : `Se termine dans ${formatTimeRemaining(b.auction.endTime)}`}
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
                      <div className="text-[var(--foreground-muted)]">Votre offre</div>
                      <div className="font-bold tabular-nums">
                        {formatPrice(b.myBid)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--foreground-muted)]">
                        Prix actuel
                      </div>
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
              {(() => {
                const live =
                  b.auction.status === "active" ||
                  b.auction.status === "ending";
                if (!b.isWinning && live) {
                  return (
                    <div className="border-t border-[var(--border)] p-2">
                      <Link href={`/auctions/${b.auction.id}/bid`}>
                        <Button size="sm" fullWidth>
Enchérir à nouveau
                        </Button>
                      </Link>
                    </div>
                  );
                }
                // Auction over but user wasn't winning — show a clear,
                // non-clickable "ended" state. Tapping the card link above
                // still takes the user to the result banner.
                if (!live && !b.isWinning) {
                  const label =
                    b.auction.status === "cancelled"
                      ? "Enchère annulée"
                      : b.auction.status === "reserve_not_met"
                        ? "Prix de réserve non atteint"
                        : b.auction.status === "pending_seller_decision"
                          ? "En attente de la décision du vendeur"
                          : "Enchère terminée";
                  return (
                    <div className="border-t border-[var(--border)] p-2">
                      <Button size="sm" fullWidth variant="secondary" disabled>
                        {label}
                      </Button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 space-y-3">
      {icon && <div className="flex justify-center">{icon}</div>}
      <div className="font-bold text-base">{title}</div>
      {subtitle && (
        <p className="text-sm text-[var(--foreground-muted)]">{subtitle}</p>
      )}
      {action}
    </div>
  );
}
