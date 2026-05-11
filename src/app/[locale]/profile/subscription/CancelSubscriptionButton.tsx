"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cancelMySubscriptionAction } from "@/app/[locale]/subscription-actions";

export function CancelSubscriptionButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const r = await cancelMySubscriptionAction();
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Abonnement annulé", "warning");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" />
        Annuler l&apos;abonnement
      </Button>
      <Modal
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        title="Annuler votre abonnement ?"
        description="Vous conservez tous les avantages jusqu'à la fin de la période en cours, puis votre compte revient au quota gratuit."
        mobileSheet={false}
      >
        <ul className="text-sm space-y-2 text-[var(--foreground-muted)]">
          <li>· Aucun remboursement de la période en cours.</li>
          <li>· Vos enchères actuelles restent en ligne.</li>
          <li>· Vous pouvez vous réabonner à tout moment depuis /pricing.</li>
        </ul>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Garder l&apos;abonnement
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Annulation…" : "Confirmer l’annulation"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
