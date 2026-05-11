"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, RotateCcw, Check } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { NativeCapture } from "@/components/auction/NativeCapture";

const checklist = [
  { time: "0-20s", label: "Tour à 360° autour de la voiture" },
  { time: "20-35s", label: "Ouverture de toutes les portes et vue intérieure" },
  { time: "35-45s", label: "Ouverture du capot moteur" },
  { time: "45-55s", label: "Démarrage du moteur" },
  { time: "55-60s", label: "Gros plan sur la plaque d'immatriculation" },
];

// PLAN §12 says the tour video runs ~60 seconds. Accept anything from
// 30 s (covers a fast checklist run) up to 90 s (small tolerance over the
// nominal cap) — reject runaway uploads earlier so the seller doesn't
// burn bandwidth on a clip the review queue will throw out anyway.
const MIN_VIDEO_S = 30;
const MAX_VIDEO_S = 90;

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      cleanup();
      resolve(d);
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("Impossible de lire la vidéo"));
    };
  });
}

async function validateVideo(
  file: File,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const duration = await readVideoDuration(file);
    if (!Number.isFinite(duration) || duration <= 0) {
      // Some Android encoders don't write a duration into the moov atom
      // until the file is fully muxed. Accept the upload rather than
      // blocking a seller on a metadata quirk; the review queue is the
      // final gate.
      return { ok: true };
    }
    if (duration < MIN_VIDEO_S) {
      return {
        ok: false,
        reason: `La vidéo est trop courte (${Math.round(duration)} s). Suivez la check-list, durée min ${MIN_VIDEO_S} s.`,
      };
    }
    if (duration > MAX_VIDEO_S) {
      return {
        ok: false,
        reason: `La vidéo dépasse ${MAX_VIDEO_S} s (mesurée ${Math.round(duration)} s). Refilmez en suivant les segments de la check-list.`,
      };
    }
    return { ok: true };
  } catch {
    // Probe failed — let the upload proceed and rely on server-side review.
    return { ok: true };
  }
}

export default function Step3Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const [videoUrl, setVideoUrl] = useState<string | null>(draft.videoUrl ?? null);

  const done = Boolean(videoUrl);

  function handleCaptured(url: string) {
    setVideoUrl(url);
    update({ videoUrl: url });
    toast("Vidéo téléversée ✓", "success");
  }

  function reset() {
    setVideoUrl(null);
    update({ videoUrl: undefined });
  }

  return (
    <CreateAuctionShell current={2}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Vidéo de la voiture</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Suivez la liste ci-dessous pendant le tournage. Touchez le bouton
            : la caméra de votre appareil s&apos;ouvre, vous filmez puis
            validez dans l&apos;écran natif.
          </p>
        </div>

        {done && videoUrl ? (
          <div className="relative aspect-[9/16] sm:aspect-video rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
            <video
              src={videoUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <NativeCapture
            kind="video"
            facing="environment"
            folder="auction-video"
            label="Filmer la voiture"
            onCaptured={handleCaptured}
            validate={validateVideo}
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
