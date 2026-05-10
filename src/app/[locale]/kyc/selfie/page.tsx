"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Camera, Eye, Volume2, ArrowRight, ArrowLeft } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { LivenessCheck } from "@/components/auction/LivenessCheck";
import { updateKycDraft } from "@/lib/kycDraft";

export default function KYCSelfiePage() {
  const router = useRouter();
  const { toast } = useToast();
  // Bumped on retry so LivenessCheck remounts cleanly (camera + models
  // re-init from scratch instead of trying to resume from torn-down refs).
  const [attemptKey, setAttemptKey] = useState(0);
  // Gate LivenessCheck behind an explicit "Commencer" tap. The tap
  // doubles as a user gesture for the browser autoplay policy — without
  // it, the AudioContext we create inside LivenessCheck stays in the
  // `suspended` state and the per-step beeps never play. The user only
  // does head movements during the gesture, never a real tap.
  const [started, setStarted] = useState(false);

  return (
    <KYCShell current={2} backHref="/kyc/id-back">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold">Selfie en direct</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Suivez les instructions à l&apos;écran. Le système vérifie en
            temps réel que vous regardez devant vous, puis tournez la tête
            à droite et à gauche — chaque étape se valide automatiquement
            quand la position est tenue.
          </p>
        </div>

        {started ? (
          <LivenessCheck
            key={attemptKey}
            onComplete={({ videoUrl, imageUrl }) => {
              updateKycDraft({
                selfieVideoUrl: videoUrl,
                selfieImageUrl: imageUrl,
              });
              toast("✓ Selfie validé — étape suivante", "success");
              router.push("/kyc/processing");
            }}
            onCancel={() => {
              setStarted(false);
              setAttemptKey((k) => k + 1);
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center shrink-0">
                  <Camera className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-bold text-sm">Préparez-vous</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                    Tenez l&apos;appareil bien droit, dans un endroit éclairé
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--foreground-muted)] ms-1">
                <li className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Regardez devant vous (~1 seconde)
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Tournez la tête à droite (~1 seconde)
                </li>
                <li className="flex items-center gap-2">
                  <ArrowLeft className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Tournez la tête à gauche (~1 seconde)
                </li>
                <li className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Un &laquo;bip&raquo; et une vibration vous confirment chaque étape
                </li>
              </ul>
            </div>

            <Button
              size="lg"
              fullWidth
              onClick={() => setStarted(true)}
            >
              <Camera className="h-5 w-5" />
              Commencer la vérification
            </Button>
          </div>
        )}
      </div>
    </KYCShell>
  );
}
