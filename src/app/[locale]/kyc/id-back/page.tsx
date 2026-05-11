"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Camera, Check, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { NativeCapture } from "@/components/auction/NativeCapture";
import { updateKycDraft } from "@/lib/kycDraft";

export default function KYCIdBackPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("kyc.idBack");
  const tCommon = useTranslations("common");
  const tKyc = useTranslations("kyc");
  const [url, setUrl] = useState<string | null>(null);

  return (
    <KYCShell current={1} backHref="/kyc/id-front">
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--gold-faint)] text-[10px] uppercase tracking-wider font-bold text-[var(--gold)] mb-3">
            {t("eyebrow")}
          </div>
          <h2 className="text-xl font-extrabold">{t("heading")}</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1.5">
            {t("subtitle")}
          </p>
        </div>

        {url ? (
          <div className="relative aspect-[4/3] rounded-[var(--radius-md)] overflow-hidden border-2 border-[var(--success)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={t("captureLabel")}
              className="h-full w-full object-cover"
            />
            <div className="absolute top-2 end-2 h-7 w-7 rounded-full bg-[var(--success)] flex items-center justify-center">
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <NativeCapture
            kind="photo"
            facing="environment"
            folder="kyc"
            label={t("captureLabel")}
            onCaptured={(u) => {
              setUrl(u);
              updateKycDraft({ idBackUrl: u });
            }}
          >
            {({ open, uploading }) => (
              <button
                onClick={open}
                disabled={uploading}
                className="relative aspect-[4/3] w-full rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)] overflow-hidden transition-colors"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Camera className="h-8 w-8 text-[var(--gold)]" />
                  <div className="text-sm font-semibold">{t("captureLabel")}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)]">
                    {t("tapToCapture")}
                  </div>
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-[var(--gold)] animate-spin" />
                  </div>
                )}
              </button>
            )}
          </NativeCapture>
        )}

        <ul className="text-xs text-[var(--foreground-muted)] space-y-1.5 px-1">
          <Tip text={t("tip1")} />
          <Tip text={t("tip2")} />
          <Tip text={t("tip3")} />
        </ul>

        {url && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => setUrl(null)}
            >
              <RotateCcw className="h-4 w-4" />
              {tKyc("action.retake")}
            </Button>
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                toast(t("toastCaptured"), "success");
                router.push("/kyc/selfie");
              }}
            >
              {tCommon("continue")}
            </Button>
          </div>
        )}
      </div>
    </KYCShell>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
      {text}
    </li>
  );
}
