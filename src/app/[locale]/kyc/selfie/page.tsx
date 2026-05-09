"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, Loader2, RotateCcw, Video } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { NativeCapture } from "@/components/auction/NativeCapture";
import { updateKycDraft } from "@/lib/kycDraft";

const livenessChecklist = [
  { time: "0-3s", label: "Regardez devant vous" },
  { time: "3-6s", label: "Tournez la tête à droite" },
  { time: "6-9s", label: "Tournez la tête à gauche" },
  { time: "9-12s", label: "Souriez" },
];

export default function KYCSelfiePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);

  return (
    <KYCShell current={2} backHref="/kyc/id-back">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold">Selfie en direct</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Touchez le bouton : la caméra avant de votre appareil s&apos;ouvre,
            vous filmez en suivant les instructions ci-dessous, puis vous
            validez dans l&apos;écran natif.
          </p>
        </div>

        {url ? (
          <div className="relative aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden border-2 border-[var(--success)] bg-black">
            <video
              src={url}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-[var(--success)] flex items-center justify-center">
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <NativeCapture
            kind="video"
            facing="user"
            folder="kyc"
            label="Filmer le selfie"
            onCaptured={(u) => {
              setUrl(u);
              updateKycDraft({ selfieVideoUrl: u });
            }}
          >
            {({ open, uploading }) => (
              <button
                onClick={open}
                disabled={uploading}
                className="relative aspect-[3/4] w-full rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)] overflow-hidden transition-colors"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6">
                  <Video className="h-9 w-9 text-[var(--gold)]" />
                  <div className="text-sm font-semibold">
                    Filmer un selfie de 10 à 12 s
                  </div>
                  <div className="text-[11px] text-[var(--foreground-muted)] text-center">
                    Toucher pour ouvrir la caméra avant
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

        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="text-xs font-bold text-[var(--gold)] mb-2">
            Étapes à suivre pendant le tournage
          </div>
          <ul className="space-y-1.5">
            {livenessChecklist.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-[var(--foreground-muted)] w-12 shrink-0">
                  {c.time}
                </span>
                <span className="text-foreground">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {url && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => setUrl(null)}
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
        )}
      </div>
    </KYCShell>
  );
}
