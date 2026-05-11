"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { ArrowRight, Check, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import { initiateSubscriptionPaymentAction } from "@/app/[locale]/subscription-actions";

interface Props {
  planSlug: string;
  planName: string;
  monthlyPrice: number;
  bullets: string[];
  /** "subscribe" = first plan; "switch" = user already has another plan
   *  on this account. The label / copy adapts. */
  mode?: "subscribe" | "switch";
}

export function SubscribeButton({
  planSlug,
  planName,
  monthlyPrice,
  bullets,
  mode = "subscribe",
}: Props) {
  const locale = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const r = await initiateSubscriptionPaymentAction({
      planSlug,
      locale,
    });
    if (!r.ok) {
      setBusy(false);
      toast("Échec : " + r.error, "error");
      return;
    }
    // Hand off to the payment provider (or our /payment/return page in
    // simulation mode). Full-page redirect is required because Konnect
    // / Clictopay live on a different origin.
    if (typeof window !== "undefined" && r.data?.redirectUrl) {
      window.location.assign(r.data.redirectUrl);
    }
  }

  const ctaLabel = mode === "switch" ? "Changer pour ce plan" : "Choisir ce plan";
  const modalTitle =
    mode === "switch"
      ? `Passer à « ${planName} »`
      : `Activer « ${planName} »`;
  const modalDescription =
    mode === "switch"
      ? "Vous serez redirigé vers la page de paiement. Votre plan actuel sera remplacé immédiatement après confirmation."
      : "Vous serez redirigé vers la page de paiement pour 30 jours d'accès.";
  const confirmLabel =
    mode === "switch" ? "Continuer vers le paiement" : "Continuer vers le paiement";

  return (
    <>
      <Button onClick={() => setOpen(true)} fullWidth size="lg">
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <Modal
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        title={modalTitle}
        description={modalDescription}
        mobileSheet={false}
      >
        <div className="space-y-4">
          {/* Pricing line */}
          <div className="rounded-2xl bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 p-4 flex items-baseline gap-1.5">
            <span className="text-3xl font-black tabular-nums text-[var(--gold-bright)]">
              {formatPrice(monthlyPrice)}
            </span>
            <span className="text-sm text-[var(--foreground-muted)]">
              / mois · sans engagement
            </span>
          </div>

          {/* Inclusions */}
          {bullets.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {bullets.slice(0, 6).map((b, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <Check className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-[var(--foreground-muted)] flex gap-2 items-start">
            <Sparkles className="h-3.5 w-3.5 text-[var(--gold)] shrink-0 mt-0.5" />
            <span>
              Vous pouvez annuler à tout moment depuis « Mon abonnement ».
              Vous conservez les avantages jusqu’à la fin de la période en
              cours.
            </span>
          </p>

          <p className="text-[11px] text-[var(--foreground-muted)] flex gap-2 items-start">
            <Lock className="h-3.5 w-3.5 text-[var(--foreground-subtle)] shrink-0 mt-0.5" />
            <span>
              Paiement simulé pour les tests. Aucun montant n&apos;est
              réellement débité — la passerelle bancaire sera activée
              prochainement.
            </span>
          </p>
        </div>

        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={confirm} disabled={busy}>
            {busy ? "Redirection…" : confirmLabel}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
