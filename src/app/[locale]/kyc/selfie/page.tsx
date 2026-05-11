"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("kyc.selfie");
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
          <h2 className="text-xl font-bold">{t("heading")}</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {t("subtitle")}
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
              toast(t("toastDone"), "success");
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
                  <div className="font-bold text-sm">{t("prepareTitle")}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                    {t("prepareHint")}
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--foreground-muted)] ms-1">
                <li className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("instruction1")}
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("instruction2")}
                </li>
                <li className="flex items-center gap-2">
                  <ArrowLeft className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("instruction3")}
                </li>
                <li className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("instruction4")}
                </li>
              </ul>
            </div>

            <Button
              size="lg"
              fullWidth
              onClick={() => setStarted(true)}
            >
              <Camera className="h-5 w-5" />
              {t("cta")}
            </Button>
          </div>
        )}
      </div>
    </KYCShell>
  );
}
