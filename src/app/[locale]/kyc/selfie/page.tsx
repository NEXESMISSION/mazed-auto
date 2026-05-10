"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { KYCShell } from "@/components/layout/KYCShell";
import { useToast } from "@/components/ui/Toast";
import { LivenessCheck } from "@/components/auction/LivenessCheck";
import { updateKycDraft } from "@/lib/kycDraft";

export default function KYCSelfiePage() {
  const router = useRouter();
  const { toast } = useToast();
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

        <LivenessCheck
          key={attemptKey}
          onComplete={({ videoUrl, imageUrl }) => {
            updateKycDraft({
              selfieVideoUrl: videoUrl,
              selfieImageUrl: imageUrl,
            });
            toast("✓ Selfie validé — étape suivante", "success");
            // Auto-advance to /kyc/processing the moment the upload
            // completes. The user already saw the "Selfie validé" success
            // overlay inside LivenessCheck during finalize; no need to
            // gate the next step behind another tap.
            router.push("/kyc/processing");
          }}
          onCancel={() => setAttemptKey((k) => k + 1)}
        />
      </div>
    </KYCShell>
  );
}
