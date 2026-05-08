"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, RotateCcw, Check } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { LiveVideoCapture } from "@/components/auction/LiveVideoCapture";

const checklist = [
  { time: "0-20s", from: 0, to: 20, label: "Tour à 360° autour de la voiture" },
  { time: "20-35s", from: 20, to: 35, label: "Ouverture des portes / vue intérieure" },
  { time: "35-45s", from: 35, to: 45, label: "Ouverture du capot moteur" },
  { time: "45-55s", from: 45, to: 55, label: "Démarrage du moteur" },
  { time: "55-60s", from: 55, to: 60, label: "Gros plan sur la plaque d'immatriculation" },
];

export default function Step3Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const [videoUrl, setVideoUrl] = useState<string | null>(draft.videoUrl ?? null);
  // `key` lets us force-remount LiveVideoCapture when the user wants to
  // re-record after a successful upload (otherwise its internal stream
  // wouldn't restart).
  const [recorderKey, setRecorderKey] = useState(0);

  const done = Boolean(videoUrl);

  function handleCapture(url: string) {
    setVideoUrl(url);
    update({ videoUrl: url });
    toast("Vidéo téléversée ✓", "success");
  }

  function reset() {
    setVideoUrl(null);
    update({ videoUrl: undefined });
    setRecorderKey((k) => k + 1);
  }

  return (
    <CreateAuctionShell current={2}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Vidéo de la voiture</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Filmez la voiture en suivant la liste ci-dessous. La caméra
            s&apos;ouvre directement, aucun fichier à téléverser.
          </p>
        </div>

        {done ? (
          <div className="relative aspect-[9/16] sm:aspect-video rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
            <video
              src={videoUrl ?? undefined}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <LiveVideoCapture
            key={recorderKey}
            minSeconds={45}
            maxSeconds={75}
            facing="environment"
            audio
            checklist={checklist}
            folder="auction-video"
            onCapture={handleCapture}
          />
        )}

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

        {done && (
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" fullWidth onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Refaire la vidéo
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
        )}
      </div>
    </CreateAuctionShell>
  );
}
