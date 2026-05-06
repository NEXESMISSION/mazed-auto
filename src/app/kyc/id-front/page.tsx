"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { CameraCapture } from "@/components/auction/CameraCapture";
import { useToast } from "@/components/ui/Toast";

export default function KYCIdFrontPage() {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <KYCShell current={0} backHref="/kyc/start">
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--gold-faint)] text-[10px] uppercase tracking-wider font-bold text-[var(--gold)] mb-3">
            Recto de la carte (1/2)
          </div>
          <h2 className="text-xl font-extrabold">Photographiez le recto de votre carte</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1.5">
            Placez la carte dans le cadre — assurez-vous que tous les textes sont nets
          </p>
        </div>

        <CameraCapture
          frame="id-card"
          hint="Bon éclairage, sans reflets"
          onCapture={() => {
            toast("✓ Recto de la carte capturé", "success");
            router.push("/kyc/id-back");
          }}
        />

        <ul className="text-xs text-[var(--foreground-muted)] space-y-1.5 px-1">
          <Tip text="Les quatre coins doivent être dans le cadre" />
          <Tip text="Sans filtre ni modification" />
          <Tip text="Textes nets et lisibles" />
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
