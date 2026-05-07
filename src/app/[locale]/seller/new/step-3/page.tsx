"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Video,
  Square,
  ArrowRight,
  RotateCcw,
  Check,
  Zap,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { cn } from "@/lib/utils";

const IS_DEV = process.env.NODE_ENV !== "production";

const checklist = [
  { time: "0-20s", label: "Tour à 360° autour de la voiture" },
  { time: "20-35s", label: "Ouverture de toutes les portes et vue intérieure" },
  { time: "35-45s", label: "Ouverture du capot moteur" },
  { time: "45-55s", label: "Démarrage du moteur" },
  { time: "55-60s", label: "Gros plan sur la plaque d'immatriculation" },
];

export default function Step3Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(Boolean(draft.videoUrl));

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const minDone = seconds >= 45;
  const maxReached = seconds >= 90;

  useEffect(() => {
    if (maxReached) stopRec();
  }, [maxReached]); // eslint-disable-line

  function startRec() {
    setSeconds(0);
    setRecording(true);
    setDone(false);
  }

  function stopRec() {
    setRecording(false);
    if (seconds >= 45) {
      setDone(true);
      update({ videoUrl: "/loading.png" }); // mock URL until storage is wired
      toast("Enregistrement vidéo réussi ✓", "success");
    } else {
      toast(`Durée trop courte (${seconds}s), minimum 45s`, "warning");
      setSeconds(0);
    }
  }

  function reset() {
    setDone(false);
    setSeconds(0);
  }

  return (
    <CreateAuctionShell current={2}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Vidéo de 60 secondes</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Enregistrement en direct qui documente la voiture. L'une de nos plus fortes défenses contre la fraude.
          </p>
        </div>

        {/* Camera viewport */}
        <div className="relative aspect-[9/16] sm:aspect-video rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
          {done ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80"
              alt="vidéo"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, #0f0f0f 0%, #050505 100%)",
              }}
            />
          )}

          {/* Recording indicator */}
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              REC
            </div>
          )}

          {/* Timer */}
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/80 backdrop-blur text-sm font-bold tabular-nums text-white">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </div>

          {/* Done overlay */}
          {done && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-sm">
              <div className="h-20 w-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(74,222,128,0.6)]">
                <Check className="h-10 w-10 text-white" strokeWidth={3} />
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--foreground-muted)]">Durée : 45-90 s</span>
            <span className="font-bold tabular-nums">{seconds}s / 60s</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                seconds < 45 && "bg-[var(--warning)]",
                seconds >= 45 && seconds <= 90 && "bg-[var(--success)]",
                seconds > 90 && "bg-[var(--danger)]",
              )}
              style={{ width: `${Math.min((seconds / 90) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
          <div className="text-xs font-bold text-[var(--gold)] mb-2">
            Contenu de la vidéo
          </div>
          <ul className="space-y-1.5">
            {checklist.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-[var(--foreground-muted)] w-12 shrink-0">
                  {c.time}
                </span>
                <span className="text-foreground">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        {done ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" fullWidth onClick={reset}>
                <RotateCcw className="h-4 w-4" />
Réinitialiser l'enregistrement
              </Button>
              <Button
                size="lg"
                fullWidth
                onClick={() => router.push("/seller/new/step-4")}
              >
                Continuer
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : recording ? (
          <Button
            size="xl"
            variant="danger"
            fullWidth
            onClick={stopRec}
            disabled={!minDone}
          >
            <Square className="h-5 w-5 fill-current" />
            {minDone ? "Arrêter l'enregistrement" : `Enregistrement... (${45 - seconds}s restantes)`}
          </Button>
        ) : (
          <Button size="xl" fullWidth onClick={startRec}>
            <Video className="h-5 w-5" />
Commencer l'enregistrement
          </Button>
        )}

        {IS_DEV && !done && (
          <button
            onClick={() => {
              update({ videoUrl: "/loading.png" });
              router.push("/seller/new/step-4");
            }}
            className="w-full rounded-[var(--radius)] border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
Mode test : ignorer la vidéo
          </button>
        )}
      </div>
    </CreateAuctionShell>
  );
}
