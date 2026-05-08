"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Video,
  ArrowRight,
  RotateCcw,
  Check,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const IS_DEV = process.env.NODE_ENV !== "production";
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB safety cap

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
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(draft.videoUrl ?? null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const done = Boolean(videoUrl);

  function pick() {
    setUploadError(null);
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_BYTES) {
      toast("Vidéo trop lourde (max 100 MB)", "warning");
      e.target.value = "";
      return;
    }
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }

    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(URL.createObjectURL(f));
    setUploading(true);
    setUploadError(null);

    const supabase = createClient();
    const ext = (f.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${user.id}/auction-video/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, f, {
        contentType: f.type || "video/mp4",
        upsert: false,
      });

    if (error) {
      setUploading(false);
      setUploadError(error.message);
      toast("Échec du téléversement : " + error.message, "error");
      return;
    }

    const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
    setVideoUrl(data.publicUrl);
    update({ videoUrl: data.publicUrl });
    setUploading(false);
    toast("Vidéo téléversée ✓", "success");
  }

  function reset() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setVideoUrl(null);
    setUploadError(null);
    update({ videoUrl: undefined });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <CreateAuctionShell current={2}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Vidéo de la voiture</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Filmez la voiture en suivant la liste ci-dessous, puis téléversez la vidéo.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={onFile}
          className="hidden"
        />

        {/* Preview viewport */}
        <div className="relative aspect-[9/16] sm:aspect-video rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
          {videoUrl || previewBlobUrl ? (
            <video
              src={videoUrl ?? previewBlobUrl ?? undefined}
              controls
              playsInline
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

          {uploading && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
                <div className="text-sm font-semibold">Téléversement…</div>
              </div>
            </div>
          )}

          {done && !uploading && (
            <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </div>
          )}
        </div>

        {uploadError && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              {uploadError}
            </div>
          </div>
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

        {done && !uploading ? (
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
        ) : (
          <Button size="xl" fullWidth onClick={pick} disabled={uploading}>
            <Video className="h-5 w-5" />
            {uploading ? "Téléversement…" : "Filmer ou choisir une vidéo"}
          </Button>
        )}

        {IS_DEV && !done && !uploading && (
          <button
            onClick={() => {
              update({
                videoUrl:
                  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
              });
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
