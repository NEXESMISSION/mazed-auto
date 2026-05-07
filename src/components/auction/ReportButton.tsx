"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Flag, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const reasons = [
  { v: "wrong_info", l: "Informations incorrectes", severity: "normal" },
  { v: "images_mismatch", l: "Les photos ne correspondent pas à la voiture", severity: "high" },
  { v: "off_platform", l: "Le vendeur demande un paiement hors plateforme", severity: "high" },
  { v: "hidden_defects", l: "La voiture a des défauts non mentionnés", severity: "normal" },
  { v: "fraud_suspicion", l: "Suspicion de fraude", severity: "high" },
  { v: "suspicious_price", l: "Prix suspect (très bas)", severity: "low" },
  { v: "disputed_ownership", l: "Propriété contestée", severity: "high" },
];

interface Props {
  auctionId?: string;
}

export function ReportButton({ auctionId }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function clickReport() {
    if (!user) {
      toast("Connectez-vous pour signaler", "info");
      router.push("/login");
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (!reason) {
      toast("Choisissez un motif", "warning");
      return;
    }
    if (!auctionId || !user) return;
    const sev = reasons.find((r) => r.v === reason)?.severity ?? "normal";
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("reports").insert({
      auction_id: auctionId,
      reporter_id: user.id,
      reporter_label: `${user.firstName} ${user.lastName?.[0] ?? ""}.`.trim(),
      reason,
      detail: desc || null,
      severity: sev,
    });
    setSubmitting(false);
    if (error) {
      toast("Échec d'envoi du signalement : " + error.message, "error");
      return;
    }
    setOpen(false);
    toast("Votre signalement a été reçu, il sera examiné sous 24 heures", "success");
    setReason("");
    setDesc("");
  }

  return (
    <>
      <button
        onClick={clickReport}
        className="h-10 w-10 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] transition-colors"
        aria-label="Signaler"
      >
        <Flag className="h-4 w-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Signaler une enchère"
        description="Aidez-nous à préserver la sécurité de la plateforme"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Motif du signalement
            </label>
            <div className="space-y-1">
              {reasons.map((r) => (
                <label
                  key={r.v}
                  className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.v}
                    checked={reason === r.v}
                    onChange={(e) => setReason(e.target.value)}
                    className="accent-[var(--gold)]"
                  />
                  <span className="text-sm">{r.l}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Description complémentaire (optionnel)
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Ajoutez des détails pour nous aider à vérifier..."
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm placeholder:text-[var(--foreground-subtle)] focus:border-[var(--gold)] focus:outline-none resize-none"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submit} disabled={submitting}>
            <Send className="h-4 w-4" />
            {submitting ? "Envoi en cours..." : "Envoyer le signalement"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
