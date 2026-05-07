"use client";

import { useRouter } from "@/i18n/navigation";
import { CheckCircle2 } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { CameraCapture } from "@/components/auction/CameraCapture";
import { useToast } from "@/components/ui/Toast";

export default function KYCIdBackPage() {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <KYCShell current={1} backHref="/kyc/id-front">
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--gold-faint)] text-[10px] uppercase tracking-wider font-bold text-[var(--gold)] mb-3">
Verso de la carte (2/2)
          </div>
          <h2 className="text-xl font-extrabold">Retournez la carte et photographiez le verso</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1.5">
            De la même manière — placez-la dans le cadre et vérifiez la netteté des données
          </p>
        </div>

        <CameraCapture
          frame="id-card"
          hint="Assurez-vous que toutes les données sont nettes"
          onCapture={() => {
            toast("✓ Verso de la carte capturé", "success");
            router.push("/kyc/selfie");
          }}
        />

        <ul className="text-xs text-[var(--foreground-muted)] space-y-1.5 px-1">
          <Tip text="Numéro de carte clairement visible" />
          <Tip text="Sans reflets sur le plastique" />
          <Tip text="Les quatre coins doivent être dans le cadre" />
        </ul>
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
