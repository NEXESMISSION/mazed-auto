"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { useAuth } from "@/lib/auth";

const checks = [
  "Extraction des données de la carte (OCR)...",
  "Correspondance du visage avec la carte...",
  "Vérification de la détection de vie...",
  "Validité de la carte...",
  "Confirmation des données...",
];

export default function KYCProcessingPage() {
  const router = useRouter();
  const { update } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < checks.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      await update({
        kycStatus: "verified",
      });
      router.push("/kyc/status");
    }, 600);
    return () => clearTimeout(t);
  }, [step, router, update]);

  return (
    <KYCShell current={3}>
      <div className="space-y-6 py-6">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)] border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full bg-[var(--gold-faint)]" />
          </div>
          <h2 className="text-xl font-bold">Vérification d'identité en cours</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Cela prend 10 à 15 secondes
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
