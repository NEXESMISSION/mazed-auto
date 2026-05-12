"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";

interface Props {
  auction: Auction;
}

/**
 * Inline accept/refuse panel for a single auction sitting in
 * `pending_seller_decision`. The seller is never auto-bound — they
 * either confirm the highest offer (winner is finalised, deposit
 * deducted from final payment) or reject it (all deposits refunded,
 * auction terminates as reserve_not_met). Each branch goes through a
 * confirmation modal because both outcomes are irreversible.
 */
export function SellerDecisionCard({ auction }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<"accept" | "reject" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reserveMissed =
    auction.reservePrice != null && auction.currentPrice < auction.reservePrice;

  async function decide(kind: "accept" | "reject") {
    setSubmitting(true);
    const supabase = createClient();
    const fn = kind === "accept" ? "seller_accept_offer" : "seller_reject_offer";
    const { error } = await supabase.rpc(fn, { p_auction_id: auction.id });
    setSubmitting(false);
    if (error) {
      toast(
        kind === "accept"
          ? "Échec de l'acceptation : " + error.message
          : "Échec du refus : " + error.message,
        "error",
      );
      return;
    }
    toast(
      kind === "accept"
        ? "Offre acceptée — l'enchérisseur a 7 jours pour payer"
        : "Offre refusée — toutes les cautions sont remboursées",
      "success",
    );
    setConfirm(null);
    router.refresh();
  }

  const deadline = auction.reserveDecisionDeadline;
  const hoursLeft = deadline
    ? Math.max(
        0,
        // eslint-disable-next-line react-hooks/purity
        Math.floor((deadline.getTime() - Date.now()) / (1000 * 60 * 60)),
      )
    : null;

  return (
    <>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-amber-500/40 overflow-hidden">
        <div className="p-4 flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(auction.vehicle.imageUrls[0], { width: 240, quality: 70 })}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm leading-tight line-clamp-1">
                {auction.vehicle.make} {auction.vehicle.model}{" "}
                {auction.vehicle.year}
              </h3>
              <span className="text-[10px] font-mono font-bold tracking-[0.05em] text-[var(--foreground-subtle)] tabular-nums">
                {auctionCode(auction.id)}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                  Offre la plus haute
                </div>
                <div className="font-extrabold text-[var(--gold)] tabular-nums text-[13px]">
                  {formatPrice(auction.currentPrice)}
                </div>
              </div>
              <div>
                <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                  Offres reçues
                </div>
                <div className="font-bold tabular-nums text-[13px]">
                  {auction.totalBids}
                </div>
              </div>
            </div>
            {reserveMissed && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 h-5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                Réserve non atteinte
              </div>
            )}
            {hoursLeft !== null && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-300">
                <Clock className="h-3 w-3" />
                <span className="tabular-nums font-bold">
                  {hoursLeft >= 24
                    ? `${Math.floor(hoursLeft / 24)} j ${hoursLeft % 24} h`
                    : `${hoursLeft} h`}
                </span>
                <span className="text-[var(--foreground-muted)]">
                  pour décider
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-[var(--border)] divide-x divide-[var(--border)] divide-x-reverse">
          <button
            type="button"
            onClick={() => setConfirm("reject")}
            disabled={submitting}
            className="py-3 text-center text-xs font-bold text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Refuser
          </button>
          <button
            type="button"
            onClick={() => setConfirm("accept")}
            disabled={submitting}
            className="py-3 text-center text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Accepter l&apos;offre
          </button>
        </div>
      </div>

      {confirm && (
        <Modal
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={
            confirm === "accept"
              ? "Accepter l'offre ?"
              : "Refuser l'offre ?"
          }
          mobileSheet={false}
        >
          <div className="space-y-4">
            <div className="rounded-[var(--radius)] bg-[var(--surface-2)] p-4 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                  Véhicule
                </span>
                <span className="font-bold text-sm truncate">
                  {auction.vehicle.make} {auction.vehicle.model}{" "}
                  {auction.vehicle.year}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                  Offre
                </span>
                <span className="font-extrabold tabular-nums gradient-gold-text">
                  {formatPrice(auction.currentPrice)}
                </span>
              </div>
            </div>

            {confirm === "accept" ? (
              <ul className="text-[12px] text-[var(--foreground-muted)] leading-relaxed space-y-1.5">
                <li>• L&apos;enchérisseur le plus haut devient l&apos;acheteur officiel.</li>
                <li>• Il a 7 jours pour finaliser le paiement (la caution déjà versée est déduite).</li>
                <li>• Vous percevez le prix final moins la commission de la plateforme.</li>
                <li className="text-[var(--warning)] font-semibold">
                  • Cette décision est définitive.
                </li>
              </ul>
            ) : (
              <ul className="text-[12px] text-[var(--foreground-muted)] leading-relaxed space-y-1.5">
                <li>• L&apos;enchère se termine sans vente.</li>
                <li>• Toutes les cautions des participants sont remboursées intégralement.</li>
                <li>• Vous pouvez republier le véhicule plus tard à un prix différent.</li>
                <li className="text-[var(--warning)] font-semibold">
                  • Cette décision est définitive.
                </li>
              </ul>
            )}
          </div>

          <ModalFooter>
            <Button variant="ghost" size="md" onClick={() => setConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant={confirm === "accept" ? "primary" : "danger"}
              size="md"
              onClick={() => decide(confirm)}
              disabled={submitting}
            >
              {submitting
                ? "Envoi..."
                : confirm === "accept"
                  ? "Confirmer l'acceptation"
                  : "Confirmer le refus"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
