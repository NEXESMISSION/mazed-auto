"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

interface Props {
  /** Visual frame guide. */
  frame?: "id-card" | "selfie" | "vehicle";
  /** Helper text under the viewport. */
  hint?: string;
  /**
   * When the upload finishes (or, if upload=false, when the snapshot is
   * frozen) we hand the URL back here.
   */
  onCapture: (url: string) => void;
  /**
   * If true, the captured frame is uploaded to Supabase Storage and the
   * resulting public URL is passed to onCapture. If false, a local data
   * URL is returned instead.
   */
  upload?: boolean;
  /**
   * Folder prefix inside the user's bucket (e.g. "kyc", "carte-grise").
   * Required when upload=true.
   */
  folder?: string;
  /** Use the front camera when true (selfie). Defaults based on `frame`. */
  facing?: "user" | "environment";
}

/**
 * Direct live camera capture using getUserMedia. There is no file picker
 * fallback — if the camera can't be opened we surface the error and let
 * the user retry. The user taps "Prendre la photo" to freeze a frame; we
 * then upload it (when upload=true) and call onCapture.
 */
export function LivePhotoCapture({
  frame = "id-card",
  hint,
  onCapture,
  upload = false,
  folder = "misc",
  facing,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const facingMode: "user" | "environment" =
    facing ?? (frame === "selfie" ? "user" : "environment");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamReady(false);
  }, []);

  const startStream = useCallback(async () => {
    setStreamError(null);
    setSnapshot(null);
    setSnapshotBlob(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStreamError("La caméra n'est pas disponible sur cet appareil.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
      setStreamReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Caméra inaccessible";
      setStreamError(msg);
    }
  }, [facingMode]);

  useEffect(() => {
    startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function takeShot() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamReady) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") {
      // Mirror selfies so the captured image matches what the user saw.
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setSnapshot(url);
        setSnapshotBlob(blob);
        stopStream();
      },
      "image/jpeg",
      0.92,
    );
  }

  async function confirm() {
    if (!snapshotBlob || !snapshot) return;
    if (!upload) {
      onCapture(snapshot);
      return;
    }
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const path = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`;
    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, snapshotBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (error) {
      setUploading(false);
      toast("Échec du téléversement : " + error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
    setUploading(false);
    onCapture(data.publicUrl);
  }

  function retake() {
    if (snapshot) URL.revokeObjectURL(snapshot);
    setSnapshot(null);
    setSnapshotBlob(null);
    startStream();
  }

  const mirrored = facingMode === "user" && !snapshot;

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <div
        className={`relative rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)] ${
          frame === "selfie" ? "aspect-[3/4]" : "aspect-[4/3]"
        }`}
      >
        {!snapshot && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${
              mirrored ? "scale-x-[-1]" : ""
            }`}
          />
        )}
        {snapshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshot}
            alt="captured"
            className="h-full w-full object-cover"
          />
        )}

        {!snapshot && <FrameGuide frame={frame} />}

        {streamReady && !snapshot && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur text-[10px] font-semibold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </div>
        )}
        {snapshot && (
          <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
            <Check className="h-5 w-5 text-white" strokeWidth={3} />
          </div>
        )}

        {!streamReady && !streamError && !snapshot && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-xs text-[var(--foreground-muted)]">
                Ouverture de la caméra…
              </div>
            </div>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-sm font-semibold">Téléversement…</div>
            </div>
          </div>
        )}
      </div>

      {streamError ? (
        <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed flex-1">
            {streamError}
            <div className="mt-1">
              Autorisez l&apos;accès à la caméra dans votre navigateur, puis
              réessayez.
            </div>
          </div>
        </div>
      ) : hint && !snapshot ? (
        <p className="text-xs text-center text-[var(--foreground-muted)]">
          {hint}
        </p>
      ) : null}

      {streamError ? (
        <Button size="lg" fullWidth onClick={startStream}>
          <RotateCcw className="h-4 w-4" />
          Réessayer
        </Button>
      ) : snapshot ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={retake}
            disabled={uploading}
          >
            <RotateCcw className="h-4 w-4" />
            Reprendre
          </Button>
          <Button size="lg" fullWidth onClick={confirm} disabled={uploading}>
            <Check className="h-5 w-5" />
            Valider
          </Button>
        </div>
      ) : (
        <Button
          size="xl"
          fullWidth
          onClick={takeShot}
          disabled={!streamReady}
        >
          <Camera className="h-5 w-5" />
          Prendre la photo
        </Button>
      )}
    </div>
  );
}

function FrameGuide({ frame }: { frame: Props["frame"] }) {
  if (frame === "selfie") {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 133"
        preserveAspectRatio="none"
      >
        <ellipse
          cx="50"
          cy="55"
          rx="32"
          ry="42"
          fill="none"
          stroke="rgba(212,175,55,0.7)"
          strokeWidth="0.7"
          strokeDasharray="2,1"
        />
      </svg>
    );
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 75"
      preserveAspectRatio="none"
    >
      <rect
        x="10"
        y="20"
        width="80"
        height="35"
        rx="3"
        fill="none"
        stroke="rgba(212,175,55,0.7)"
        strokeWidth="0.5"
        strokeDasharray="2,1"
      />
    </svg>
  );
}
