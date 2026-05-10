"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Clock, ExternalLink, Check, X } from "lucide-react";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { forceSellerDecisionAction } from "@/app/[locale]/admin/actions";

interface Props {
  items: Auction[];
}

/**
 * Visibility list of auctions sitting in `pending_seller_decision`.
 * Past-deadline rows are auto-resolved by the cron, but admins can
 * force-resolve at any time via `admin_force_seller_decision`.
 */
export function PendingDecisionList({ items }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState<{
    auction: Auction;
    choice: "accept" | "reject";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(true);
    const res = await forceSellerDecisionAction({
      auctionId: target.auction.id,
      choice: target.choice,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast(
      target.choice === "accept" ? "Offre acceptée pour le vendeur" : "Offre refusée pour le vendeur",
      "success",
    );
    setTarget(null);
    setReason("");
    router.refresh();
  }

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
            <div className="border-t border-[var(--border)] p-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTarget({ auction: a, choice: "accept" });
                  setReason("");
                }}
              >
                <Check className="h-4 w-4" />
                Forcer Accepter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTarget({ auction: a, choice: "reject" });
                  setReason("");
                }}
              >
                <X className="h-4 w-4" />
                Forcer Refuser
              </Button>
            </div>
          </div>
        );
      })}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.choice === "accept"
            ? "Forcer l'acceptation"
            : "Forcer le refus"
        }
        description="L'action est consignée au journal d'audit."
        mobileSheet={false}
      >
        <div className="space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Raison (transmise au vendeur)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setTarget(null)}>
            Annuler
          </Button>
          <Button size="md" onClick={submit} disabled={busy}>
            {busy ? "..." : "Confirmer"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
