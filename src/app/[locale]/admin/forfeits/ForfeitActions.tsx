"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { adminReverseForfeitAction } from "@/app/[locale]/admin/actions";

export function ForfeitActions({ forfeitId }: { forfeitId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(true);
    const r = await adminReverseForfeitAction({
      forfeitId,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Forfait annulé — caution restituée", "success");
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3.5 w-3.5" />
        Annuler
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Annuler ce forfait"
        description="Les parts vendeur + plateforme seront créditées en sens inverse, la caution sera restituée à l'enchérisseur et il sera notifié."
        mobileSheet={false}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Raison (transmise à l'enchérisseur et journalisée)"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submit} disabled={busy}>
            {busy ? "..." : "Annuler le forfait"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
