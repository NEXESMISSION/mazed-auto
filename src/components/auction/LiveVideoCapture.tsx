"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video,
  Square,
  RotateCcw,
  AlertTriangle,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

interface Props {
  /** Min seconds the user must record before they can stop. */
  minSeconds?: number;
  /** Hard cap — auto-stops at this point. */
  maxSeconds?: number;
  /** Front-facing for selfie videos. Defaults to environment. */
  facing?: "user" | "environment";
  /** Capture audio with the video. Defaults to true. */
  audio?: boolean;
  /** Aspect ratio class for the viewport. */
  aspectClass?: string;
  /**
   * Optional checklist drawn over the live preview, useful for guiding
   * the seller through the 60s vehicle walkaround. Each item shows up
   * during its time window.
   */
  checklist?: { time: string; from: number; to: number; label: string }[];
  /** Folder under user's bucket (e.g. "auction-video", "kyc"). */
  folder: string;
  /** Called with the uploaded public URL once the video is in storage. */
  onCapture: (url: string) => void;
}

/**
 * Live video recorder using getUserMedia + MediaRecorder. There is no
 * file picker fallback — the user records directly in the browser. We
 * upload to Supabase Storage as soon as they validate and pass the URL
 * back via onCapture.
 */
export function LiveVideoCapture({
  minSeconds = 30,
  maxSeconds = 90,
  facing = "environment",
  audio = true,
  aspectClass = "aspect-[9/16] sm:aspect-video",
  checklist,
  folder,
  onCapture,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<{ url: string; blob: Blob; mime: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamReady(false);
  }, []);

  const startStream = useCallback(async () => {
    setStreamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStreamError("La caméra n'est pas disponible sur cet appareil.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio,
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
  }, [facing, audio]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startStream();
    return () => {
      stopStream();
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickMime(): string {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const t of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  }

  function startRecording() {
    if (!streamRef.current || recording) return;
    const mime = pickMime();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        streamRef.current,
        mime ? { mimeType: mime } : undefined,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enregistrement non supporté";
      setStreamError(msg);
      return;
    }
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      setRecorded({ url, blob, mime: type });
      stopStream();
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxSeconds) {
          stopRecording();
          return s + 1;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
  }

  async function confirm() {
    if (!recorded) return;
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const ext = recorded.mime.includes("mp4") ? "mp4" : "webm";
    const path = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, recorded.blob, {
        contentType: recorded.mime,
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
    if (recorded) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
    setSeconds(0);
    startStream();
  }

  const canStop = seconds >= minSeconds;
  const currentChecklist = checklist?.find(
    (c) => seconds >= c.from && seconds < c.to,
  );
  const mirrored = facing === "user" && !recorded;

  return (
    <div className="space-y-4">
      <div
        className={`relative ${aspectClass} rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]`}
      >
        {!recorded && (
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
        {recorded && (
          <video
            ref={previewRef}
            src={recorded.url}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        )}

        {!streamReady && !streamError && !recorded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-xs text-[var(--foreground-muted)]">
                Ouverture de la caméra…
              </div>
            </div>
          </div>
        )}

        {recording && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600/90 backdrop-blur text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            REC {String(Math.floor(seconds / 60)).padStart(1, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </div>
        )}
        {!recording && streamReady && !recorded && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur text-[10px] font-semibold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </div>
        )}
        {recorded && (
          <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_20px_rgba(74,222,128,0.6)]">
            <Check className="h-5 w-5 text-white" strokeWidth={3} />
          </div>
        )}

        {recording && currentChecklist && (
          <div className="absolute bottom-4 left-3 right-3">
            <div className="rounded-full bg-black/80 backdrop-blur px-4 py-2.5 text-center flex items-center justify-center gap-2">
              <span className="font-mono text-[10px] text-[var(--foreground-muted)]">
                {currentChecklist.time}
              </span>
              <span className="font-bold text-[var(--gold)] text-sm">
                {currentChecklist.label}
              </span>
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

      {streamError && (
        <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed flex-1">
            {streamError}
            <div className="mt-1">
              Autorisez l&apos;accès à la caméra et au micro dans votre
              navigateur, puis réessayez.
            </div>
          </div>
        </div>
      )}

      {streamError ? (
        <Button size="lg" fullWidth onClick={startStream}>
          <RotateCcw className="h-4 w-4" />
          Réessayer
        </Button>
      ) : recorded ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={retake}
            disabled={uploading}
          >
            <RotateCcw className="h-4 w-4" />
            Refaire
          </Button>
          <Button size="lg" fullWidth onClick={confirm} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Valider la vidéo
          </Button>
        </div>
      ) : recording ? (
        <Button
          size="xl"
          fullWidth
          onClick={stopRecording}
          variant={canStop ? "primary" : "secondary"}
          disabled={!canStop}
        >
          <Square className="h-5 w-5" />
          {canStop
            ? "Arrêter l'enregistrement"
            : `Continuez (min ${minSeconds - seconds}s)`}
        </Button>
      ) : (
        <Button
          size="xl"
          fullWidth
          onClick={startRecording}
          disabled={!streamReady}
        >
          <Video className="h-5 w-5" />
          Démarrer l&apos;enregistrement
        </Button>
      )}
    </div>
  );
}
