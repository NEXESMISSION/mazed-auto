"use client";

import { useRouter } from "@/i18n/navigation";
import { KYCShell } from "@/components/layout/KYCShell";
import { LiveVideoCapture } from "@/components/auction/LiveVideoCapture";
import { useToast } from "@/components/ui/Toast";
import { updateKycDraft } from "@/lib/kycDraft";

// 12-second selfie liveness clip — long enough to actually see the user
// turn their head + smile, short enough that the upload is quick. The
// admin reviews the video manually; we don't run face-match locally.
const livenessChecklist = [
  { time: "0-3s", from: 0, to: 3, label: "Regardez devant vous" },
  { time: "3-6s", from: 3, to: 6, label: "Tournez la tête à droite" },
  { time: "6-9s", from: 6, to: 9, label: "Tournez la tête à gauche" },
  { time: "9-12s", from: 9, to: 12, label: "Souriez" },
];

export default function KYCSelfiePage() {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <KYCShell current={2} backHref="/kyc/id-back">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold">Selfie en direct</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Enregistrez une courte vidéo en suivant les instructions à
            l&apos;écran. La caméra avant s&apos;ouvre directement.
          </p>
        </div>

        <LiveVideoCapture
          minSeconds={10}
          maxSeconds={15}
          facing="user"
          audio={false}
          aspectClass="aspect-[3/4]"
          checklist={livenessChecklist}
          folder="kyc"
          onCapture={(url) => {
            updateKycDraft({ selfieVideoUrl: url });
            toast("✓ Selfie enregistré", "success");
            router.push("/kyc/processing");
          }}
        />

        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="text-xs font-bold text-[var(--gold)] mb-2">
            Étapes à suivre pendant l&apos;enregistrement
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
      </div>
    </KYCShell>
  );
}
