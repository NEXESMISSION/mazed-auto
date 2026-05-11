"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  ShieldCheck,
  X,
  ArrowRight,
  Camera,
  Hourglass,
  AlertTriangle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";

// localStorage key (per user) holding the last dismissal timestamp.
const DISMISS_KEY = (userId: string) => `mazed_kyc_reminder_dismissed:${userId}`;
// 24 hours — once skipped, don't pester again until the next day.
const SNOOZE_MS = 24 * 60 * 60 * 1000;
// Delay before showing on each page load — gives the user a moment to land.
const SHOW_DELAY_MS = 4_000;

/**
 * Soft, skippable KYC reminder. Pops on the home page (and any page that
 * mounts this component) after a short delay when the signed-in user
 * still hasn't verified. Two dismiss paths:
 *   - "Plus tard"  → snooze 24h via localStorage
 *   - "Continuer"  → routes to /kyc/start (or /kyc/status when pending/rejected)
 *
 * Verified users never see it. Guests never see it. Once dismissed within
 * the last 24h the gate stays closed even on refresh — so the user doesn't
 * see the same popup on every navigation. Designed not to annoy.
 */
export function KycReminderPopup() {
  const { user, loaded } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (!user) return;
    if (user.kycStatus === "verified") return;

    // Recently dismissed? Stay quiet.
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY(user.id)) ?? "0");
      if (last && Date.now() - last < SNOOZE_MS) return;
    } catch {
      // localStorage unavailable — show anyway, it'll snooze on click
    }

    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [loaded, user]);

  function dismiss() {
    if (user) {
      try {
        localStorage.setItem(DISMISS_KEY(user.id), String(Date.now()));
      } catch {
        // ignore
      }
    }
    setOpen(false);
  }

  if (!user || user.kycStatus === "verified") return null;

  // Branch the popup contents by state so the copy matches what the user
  // actually needs to do next.
  const state = user.kycStatus;
  const isPending = state === "pending";
  const isRejected = state === "rejected";
  const ctaHref =
    isPending || isRejected ? "/kyc/status" : "/kyc/start";
  const ctaLabel = isPending
    ? "Voir le statut"
    : isRejected
      ? "Réessayer"
      : "Vérifier maintenant";

  return (
    <Modal open={open} onClose={dismiss} size="md" mobileSheet={false}>
      <div className="relative">
        {/* Decorative gold halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -end-20 h-56 w-56 rounded-full bg-[var(--gold)] blur-3xl opacity-20"
        />

        <div className="relative px-6 pt-6 pb-5 lg:px-8 lg:pt-8 lg:pb-6">
          {/* Skip button on the end */}
          <button
            onClick={dismiss}
            aria-label="Plus tard"
            className="absolute top-4 end-4 h-9 w-9 rounded-full bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--foreground-muted)] hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icon */}
          <div className="h-14 w-14 lg:h-16 lg:w-16 rounded-2xl bg-[var(--gold)] text-black flex items-center justify-center shadow-[var(--shadow-gold)]">
            {isPending ? (
              <Hourglass className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={2.5} />
            ) : isRejected ? (
              <AlertTriangle className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={2.5} />
            ) : (
              <ShieldCheck className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={2.5} />
            )}
          </div>

          {/* Headline */}
          <div className="mt-4 lg:mt-5">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
              {isPending
                ? "Vérification en cours"
                : isRejected
                  ? "Vérification refusée"
                  : "Avant d'enchérir ou de vendre"}
            </div>
            <h3 className="mt-2 text-2xl lg:text-[28px] font-black tracking-tight leading-[1.1] max-w-md">
              {isPending
                ? "Votre vérification est en cours d'examen"
                : isRejected
                  ? "Réessayez la vérification d'identité"
                  : "Vérifiez votre identité — 2 minutes seulement"}
            </h3>
            <p className="mt-3 text-sm lg:text-[15px] text-[var(--foreground-muted)] leading-relaxed">
              {isPending
                ? "Nous examinons vos documents. Vous serez notifié dès la décision (1–2 jours). Vous pouvez fermer cette fenêtre."
                : isRejected
                  ? "Vos documents n'ont pas été validés. Consultez le motif et soumettez de nouvelles photos."
                  : "C'est la dernière étape avant de pouvoir enchérir ou vendre. KYC humain, sans tracas — vous n'avez à le faire qu'une seule fois."}
            </p>
          </div>

          {/* Quick checklist — only shown for the initial 'none' state */}
          {!isPending && !isRejected && (
            <ul className="mt-5 space-y-2 text-[13px]">
              <Tick text="Carte d'identité (recto + verso)" />
              <Tick text="Selfie en direct" />
              <Tick text="Approbation manuelle sous 24 h" />
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 lg:px-8 py-4 lg:py-5 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-end">
          <button
            onClick={dismiss}
            className="h-11 lg:h-12 px-5 rounded-full text-sm font-bold text-[var(--foreground-muted)] hover:text-foreground hover:bg-[var(--surface-2)] transition-colors"
          >
            Plus tard
          </button>
          <Link
            href={ctaHref}
            onClick={dismiss}
            className="group inline-flex items-center justify-center gap-2 h-11 lg:h-12 px-6 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.99] transition-transform"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </Modal>
  );
}

function Tick({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="h-6 w-6 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center shrink-0">
        <Camera className="h-3 w-3" />
      </span>
      <span className="text-foreground/90">{text}</span>
    </li>
  );
}
