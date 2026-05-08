"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { clearKycDraft, readKycDraft } from "@/lib/kycDraft";

const checks = [
  "Téléversement des documents…",
  "Enregistrement de votre dossier…",
  "Mise en file pour examen humain…",
];

export default function KYCProcessingPage() {
  const router = useRouter();
  const { user, update } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Submitting can re-render this component multiple times; the ref keeps
  // the network call from firing twice and creating two pending rows.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    let cancelled = false;
    async function submit() {
      if (!user) {
        setError("Vous devez être connecté pour finaliser la vérification.");
        return;
      }

      const draft = readKycDraft();
      if (!draft.idFrontUrl || !draft.idBackUrl || !draft.selfieVideoUrl) {
        setError(
          "Documents manquants. Veuillez recommencer depuis le début.",
        );
        return;
      }

      // Visual progress — cosmetic, but it makes the upload feel less
      // abrupt to the user.
      const advance = (i: number) =>
        new Promise<void>((res) => setTimeout(() => {
          if (!cancelled) setStep(i);
          res();
        }, 700));

      await advance(1);

      const supabase = createClient();
      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(" ");

      // Upsert so a second attempt after a rejection replaces the old row.
      const { error: insertErr } = await supabase
        .from("kyc_submissions")
        .upsert(
          {
            user_id: user.id,
            full_name: fullName || null,
            id_front_url: draft.idFrontUrl,
            id_back_url: draft.idBackUrl,
            selfie_video_url: draft.selfieVideoUrl,
            selfie_image_url: draft.selfieImageUrl ?? null,
            status: "pending",
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (insertErr) {
        if (!cancelled) {
          setError(
            "Échec de l'enregistrement de votre dossier : " +
              insertErr.message,
          );
        }
        return;
      }

      await advance(2);

      // Flip the user's kycStatus to "pending" — NOT verified. An admin
      // approves it later via the kyc-queue page.
      const { error: updateErr } = await update({ kycStatus: "pending" });
      if (updateErr) {
        if (!cancelled) {
          setError(
            "Échec de la mise à jour de votre profil : " + updateErr.message,
          );
        }
        return;
      }

      await advance(3);
      clearKycDraft();
      if (!cancelled) router.push("/kyc/status");
    }

    submit();
    return () => {
      cancelled = true;
    };
  }, [user, update, router]);

  if (error) {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Une erreur est survenue</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              {error}
            </p>
          </div>
          <Button size="lg" fullWidth onClick={() => router.push("/kyc/start")}>
            Recommencer la vérification
          </Button>
        </div>
      </KYCShell>
    );
  }

  return (
    <KYCShell current={3}>
      <div className="space-y-6 py-6">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)] border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full bg-[var(--gold-faint)]" />
          </div>
          <h2 className="text-xl font-bold">Envoi de votre dossier</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Quelques secondes…
          </p>
        </div>

        <div className="space-y-2">
          {checks.map((check, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)]"
              >
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-green-500 text-white"
                      : active
                        ? "bg-[var(--gold-faint)] border-2 border-[var(--gold)]"
                        : "bg-[var(--surface-2)]"
                  }`}
                >
                  {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  {active && (
                    <div className="h-2 w-2 rounded-full bg-[var(--gold)] animate-pulse" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    done
                      ? "text-foreground"
                      : active
                        ? "text-[var(--gold)] font-semibold"
                        : "text-[var(--foreground-subtle)]"
                  }`}
                >
                  {check}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </KYCShell>
  );
}
