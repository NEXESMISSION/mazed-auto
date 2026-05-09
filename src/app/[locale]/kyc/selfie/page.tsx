"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, Eye, RotateCcw, ShieldCheck } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { LivenessCheck } from "@/components/auction/LivenessCheck";
import { updateKycDraft } from "@/lib/kycDraft";

export default function KYCSelfiePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // Bumped on retry so LivenessCheck remounts cleanly (camera + models
  // re-init from scratch instead of trying to resume from torn-down refs).
  const [attemptKey, setAttemptKey] = useState(0);

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

        {imageUrl ? (
          <>
            <div className="relative aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden border-2 border-[var(--success)] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-[var(--success)] flex items-center justify-center">
                <Check className="h-4 w-4 text-white" strokeWidth={3} />
              </div>
              <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/85 to-transparent text-white text-[11px]">
                <div className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  <span className="font-bold">Vérification automatique réussie</span>
                </div>
              </div>
            </div>

            {/* Reminder that admin still reviews everything — no false
                impression that the AI gate is the final word. */}
            <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3 flex items-start gap-2.5 text-xs">
              <Eye className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
              <div className="text-[var(--foreground-muted)] leading-relaxed">
                <span className="text-foreground font-semibold">
                  Vérification finale par notre équipe :
                </span>{" "}
                un agent contrôle vos pièces et votre selfie sous 24-48 h.
                La vérification automatique accélère le tri mais ne remplace
                pas la revue humaine.
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => {
                  setImageUrl(null);
                  setAttemptKey((k) => k + 1);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Refaire
              </Button>
              <Button
                size="lg"
                fullWidth
                onClick={() => {
                  toast("✓ Selfie enregistré", "success");
                  router.push("/kyc/processing");
                }}
              >
                Envoyer
              </Button>
            </div>
          </>
        ) : (
          <LivenessCheck
            key={attemptKey}
            onComplete={({ videoUrl, imageUrl }) => {
              updateKycDraft({
                selfieVideoUrl: videoUrl,
                selfieImageUrl: imageUrl,
              });
              setImageUrl(imageUrl);
            }}
            onCancel={() => setAttemptKey((k) => k + 1)}
          />
        )}
      </div>
    </KYCShell>
  );
}
