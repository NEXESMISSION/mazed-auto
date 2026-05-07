"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Camera,
  Check,
  ArrowRight,
  Eye,
  RotateCw,
  RotateCcw,
  Smile,
} from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const livenessSteps: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "Regardez devant vous", Icon: Eye },
  { label: "Tournez la tête à droite", Icon: RotateCw },
  { label: "Tournez la tête à gauche", Icon: RotateCcw },
  { label: "Souriez", Icon: Smile },
];

export default function KYCSelfiePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!started || done) return;
    if (step >= livenessSteps.length) {
      setDone(true);
      setTimeout(() => router.push("/kyc/processing"), 800);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1500);
    return () => clearTimeout(t);
  }, [started, step, done, router]);

  const progress = (step / livenessSteps.length) * 100;
  const current = livenessSteps[Math.min(step, livenessSteps.length - 1)];

  return (
    <KYCShell current={2} backHref="/kyc/id-back">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold">Prenez un selfie en direct</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Suivez les instructions et bougez le visage doucement
          </p>
        </div>

        {/* Camera */}
        <div className="relative aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, #1a1a1a 0%, #050505 100%)",
            }}
          />

          {/* Face oval */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 133"
            preserveAspectRatio="none"
          >
            <ellipse
              cx="50"
              cy="50"
              rx="32"
              ry="42"
              fill="none"
              stroke={done ? "#4ade80" : "rgba(212,175,55,0.7)"}
              strokeWidth="0.7"
              strokeDasharray={done ? "0" : "2,1"}
              className={cn(started && !done && "animate-pulse")}
            />
          </svg>

          {/* Live indicator */}
          {!done && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur text-[10px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>
          )}

          {/* Instruction */}
          {started && !done && (
            <div className="absolute bottom-6 left-4 right-4">
              <div className="rounded-full bg-black/80 backdrop-blur px-4 py-3 text-center flex items-center justify-center gap-2">
                <current.Icon className="h-5 w-5 text-[var(--gold)]" />
                <div className="font-bold text-[var(--gold)]">
                  {current.label}
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
              <div className="h-20 w-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(74,222,128,0.6)]">
                <Check className="h-10 w-10 text-white" strokeWidth={3} />
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {started && (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--gold)] transition-all duration-500"
                style={{ width: `${done ? 100 : progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--foreground-muted)]">
              {livenessSteps.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-1",
                    i < step && "text-[var(--gold)]",
                  )}
                >
                  {i < step && <Check className="h-3 w-3" />}
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {!started && (
          <Button size="xl" fullWidth onClick={() => setStarted(true)}>
            <Camera className="h-5 w-5" />
            Commencer
          </Button>
        )}

        {done && (
          <Button size="xl" fullWidth disabled>
            <ArrowRight className="h-5 w-5" />
Redirection...
          </Button>
        )}
      </div>
    </KYCShell>
  );
}
