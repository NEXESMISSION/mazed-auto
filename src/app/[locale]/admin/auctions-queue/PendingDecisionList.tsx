"use client";

import { Link } from "@/i18n/navigation";
import { Clock, ExternalLink } from "lucide-react";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

interface Props {
  items: Auction[];
}

/**
 * Read-only visibility list of auctions sitting in
 * `pending_seller_decision`. Each row shows the highest offer, the
 * deadline countdown, and a link to the public auction page. Past-
 * deadline rows are auto-resolved by the `end_expired_auctions` cron
 * sweep (status flips to `reserve_not_met`, deposits refunded). Force-
 * resolve from the admin requires an admin-only RPC that bypasses the
 * `auth.uid() = seller_id` check — out of scope for this pass.
 */
export function PendingDecisionList({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((a) => {
        const deadline = a.reserveDecisionDeadline;
        const overdue =
          deadline !== undefined && deadline.getTime() <= Date.now();
        const hoursLeft = deadline
          ? Math.max(
              0,
              Math.floor((deadline.getTime() - Date.now()) / (1000 * 60 * 60)),
            )
          : null;
        return (
          <div
            key={a.id}
            className={`rounded-[var(--radius-md)] bg-[var(--surface)] border ${overdue ? "border-red-500/40" : "border-amber-500/40"} overflow-hidden`}
          >
            <div className="p-4 flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb(a.vehicle.imageUrls[0], { width: 220, quality: 60 })}
                alt=""
                className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
                loading="lazy"
                decoding="async"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm leading-tight line-clamp-1">
                    {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                  </h3>
                  <span className="text-[10px] font-mono font-bold tracking-[0.05em] text-[var(--foreground-subtle)] tabular-nums">
                    {auctionCode(a.id)}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                      Offre la plus haute
                    </div>
                    <div className="font-extrabold text-[var(--gold)] tabular-nums text-[13px]">
                      {formatPrice(a.currentPrice)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                      Réserve
                    </div>
                    <div className="font-bold tabular-nums text-[13px]">
                      {a.reservePrice
                        ? formatPrice(a.reservePrice)
                        : "—"}
                    </div>
                  </div>
                </div>
                {hoursLeft !== null && (
                  <div
                    className={`mt-2 inline-flex items-center gap-1.5 text-[11px] ${
                      overdue ? "text-red-300" : "text-amber-300"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums font-bold">
                      {overdue
                        ? "Dépassé"
                        : hoursLeft >= 24
                          ? `${Math.floor(hoursLeft / 24)} j ${hoursLeft % 24} h`
                          : `${hoursLeft} h restantes`}
                    </span>
                  </div>
                )}
              </div>
              <Link
                href={`/auctions/${a.id}`}
                target="_blank"
                rel="noopener"
                className="shrink-0 h-8 w-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
                aria-label="Ouvrir l'enchère"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
