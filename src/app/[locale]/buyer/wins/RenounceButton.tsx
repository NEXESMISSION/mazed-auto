"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import { voluntaryForfeit } from "./actions";

interface Props {
  auctionId: string;
  /** Deposit amount the user will lose if they confirm. */
  deposit: number;
  /** Read-friendly auction title for the warning copy. */
  auctionLabel: string;
}

const errorCopy: Record<string, string> = {
  NOT_AUTHENTICATED: "Vous devez être connecté.",
  NOT_CURRENT_WINNER:
    "Vous n'êtes plus le gagnant actuel — un autre enchérisseur a été promu.",
  ALREADY_PAID:
    "Le paiement final a déjà été reçu pour cette enchère, le retrait n'est plus possible.",
  AUCTION_NOT_FOUND: "Enchère introuvable.",
  UNKNOWN: "Action impossible. Réessayez plus tard.",
};

/**
 * Voluntary forfeit affordance for /buyer/wins. Shows an explicit warning
 * with the exact deposit amount the user is about to lose, then calls
 * the server action. The SQL function does the authoritative check; this
 * component is the human-friendly wrapper.
 */
export function RenounceButton({ auctionId, deposit, auctionLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function confirm() {
    startTransition(async () => {
      const result = await voluntaryForfeit(auctionId);
      if (result.ok) {
        toast(
          `Vous avez renoncé à ${auctionLabel}. Caution de ${formatPrice(deposit)} perdue.`,
          "info",
        );
        setOpen(false);
      } else {
        toast(errorCopy[result.code] ?? errorCopy.UNKNOWN, "error");
      }
    });
  }

  return (
    <>
      <Button
        size="md"
        variant="ghost"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
        <span className="text-[var(--danger)]">Se retirer</span>
      </Button>

      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title="Renoncer à votre victoire ?"
      >
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-red-400">
                Vous perdez votre caution de {formatPrice(deposit)}
              </div>
              <div className="text-[var(--foreground-muted)] text-xs mt-1.5 leading-relaxed">
                Cette action est irréversible. La caution sera redistribuée
                entre le vendeur (70%) et la plateforme (30%). Le prochain
                enchérisseur recevra une notification pour acheter à son prix.
              </div>
            </div>
          </div>
          <div className="text-xs text-[var(--foreground-muted)]">
            Enchère : <b>{auctionLabel}</b>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              size="md"
              fullWidth
              onClick={confirm}
              disabled={isPending}
            >
              {isPending ? "Traitement..." : "Confirmer le retrait"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
