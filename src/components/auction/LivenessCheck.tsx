"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Check,
  Camera,
  Loader2,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { uploadToBucket } from "@/lib/upload";

type StepId = "front" | "right" | "left";

interface StepDef {
  id: StepId;
  label: string;
  hint: string;
  Icon: typeof Eye;
}

const STEPS: StepDef[] = [
  { id: "front", label: "Regardez devant vous",      hint: "Centrez votre visage face à la caméra", Icon: Eye },
  { id: "right", label: "Tournez la tête à droite",  hint: "Doucement, tournez vers votre droite",  Icon: ArrowRight },
  { id: "left",  label: "Tournez la tête à gauche",  hint: "Doucement, tournez vers votre gauche",  Icon: ArrowLeft },
];

// Detection thresholds. Yaw is computed as (nose.x - face_center) /
// half_face_width. Negative when the user turns to their right (camera
// flips horizontally so it appears as turning right on screen too).
const HOLD_MS = 1100;       // satisfy the condition for ~1.1s before tick
const FRONT_YAW_MAX = 0.18; // |yaw| < 0.18 → looking forward
const SIDE_YAW_MIN = 0.30;  // |yaw| > 0.30 → turned to side
const MIN_FACE_FRAC = 0.18; // face width ≥ 18% of video width
const DETECT_INTERVAL_MS = 120; // ~8 fps — light enough for low-end phones

type FaceApiNs = typeof import("@vladmandic/face-api");
type TinyFaceDetectorOptionsLike = InstanceType<
  FaceApiNs["TinyFaceDetectorOptions"]
>;

export interface LivenessResult {
  /** Public URL of the uploaded video clip (12s of evidence). */
  videoUrl: string;
  /** Public URL of the uploaded "looking forward" still image. */
  imageUrl: string;
}

interface Props {
  onComplete: (r: LivenessResult) => void;
  onCancel?: () => void;
}

/**
 * Browser-side guided liveness check. Runs face-api.js against a live
 * webcam preview, walks the user through three head poses (front →
 * right → left), and only advances when the pose has been held for
 * ~1.1s. Front-frame snapshot + 12s video are uploaded to the user's
 * Supabase folder; admin still reviews everything manually.
 *
 * No remote server, no third-party processing, no payment per check.
 * Anti-spoofing isn't bulletproof (a sophisticated video replay can
 * fool any browser-only flow), so admin review stays the safety net.
 */
export function LivenessCheck({ onComplete, onCancel }: Props) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const faceapiRef = useRef<FaceApiNs | null>(null);
  const detectorOptionsRef = useRef<unknown>(null);
  const heldSinceRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef<number>(0);
  const stoppedRef = useRef<boolean>(false);
  const frontSnapshotRef = useRef<Blob | null>(null);

  const [phase, setPhase] = useState<
    "boot" | "running" | "uploading" | "done" | "error"
  >("boot");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(
    new Set(),
  );
  const [progress, setProgress] = useState(0); // 0-1, current step hold
  const [livePoseHint, setLivePoseHint] = useState<string>(
    "Préparation de la caméra...",
  );

  const totalSteps = STEPS.length;
  const currentStep = STEPS[stepIdx];

  /* ─────────────────────────────────────────────────────────────────────────
   * Boot: load models + camera + recorder
   * ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;
    (async () => {
      try {
        setLivePoseHint("Chargement du modèle de visage...");
        const faceapi = await import("@vladmandic/face-api");
        if (cancelled) return;
        faceapiRef.current = faceapi;
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api");
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(
          "/models/face-api",
        );
        detectorOptionsRef.current = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5,
        });

        if (cancelled) return;
        setLivePoseHint("Demande d'accès à la caméra...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }

        // MediaRecorder for the evidence video. Best-effort: on Safari
        // some MIME types aren't supported, fall through to no video.
        try {
          const mime = pickRecorderMime();
          if (mime) {
            const rec = new MediaRecorder(stream, { mimeType: mime });
            rec.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            rec.start(500);
            recorderRef.current = rec;
          }
        } catch {
          // ignore — video is a nice-to-have, the snapshot is the proof
        }

        setPhase("running");
        setLivePoseHint("Suivez les étapes ci-dessous");
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error ? e.message : "Impossible d'initialiser la caméra";
        setErrorMsg(msg);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
   * Detection loop
   * ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const tick = async () => {
      if (stoppedRef.current) return;
      const now = performance.now();
      if (
        now - lastDetectAtRef.current >= DETECT_INTERVAL_MS &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        faceapiRef.current
      ) {
        lastDetectAtRef.current = now;
        await runDetection();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIdx]);

  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    const faceapi = faceapiRef.current;
    if (!video || !faceapi || !detectorOptionsRef.current) return;
    const det = await faceapi
      .detectSingleFace(
        video,
        detectorOptionsRef.current as TinyFaceDetectorOptionsLike,
      )
      .withFaceLandmarks(true);

    if (!det) {
      setLivePoseHint("Aucun visage détecté — placez-vous devant la caméra");
      heldSinceRef.current = null;
      setProgress(0);
      return;
    }
    const box = det.detection.box;
    const videoW = video.videoWidth || 1;
    if (box.width / videoW < MIN_FACE_FRAC) {
      setLivePoseHint("Rapprochez-vous un peu de la caméra");
      heldSinceRef.current = null;
      setProgress(0);
      return;
    }

    const yaw = computeYaw(det.landmarks);
    const pass = stepPasses(STEPS[stepIdx].id, yaw);

    if (!pass.ok) {
      setLivePoseHint(pass.hint);
      heldSinceRef.current = null;
      setProgress(0);
      return;
    }

    setLivePoseHint("Maintenez la position...");
    if (heldSinceRef.current === null) heldSinceRef.current = performance.now();
    const elapsed = performance.now() - heldSinceRef.current;
    setProgress(Math.min(1, elapsed / HOLD_MS));

    if (elapsed >= HOLD_MS) {
      // Step satisfied. Snapshot the front frame the first time we see
      // it (used as the still preview + KYC headshot upload).
      if (STEPS[stepIdx].id === "front") {
        try {
          frontSnapshotRef.current = await canvasSnapshot(video);
        } catch {
          // ignore — we'll fall back to the first video frame on upload
        }
      }
      heldSinceRef.current = null;
      setProgress(0);
      setCompletedSteps((s) => {
        const next = new Set(s);
        next.add(STEPS[stepIdx].id);
        return next;
      });
      if (stepIdx + 1 < totalSteps) {
        setStepIdx((i) => i + 1);
      } else {
        finalize();
      }
    }
  }, [stepIdx, totalSteps]);

  /* ─────────────────────────────────────────────────────────────────────────
   * Finalize: stop recorder, upload snapshot + video
   * ───────────────────────────────────────────────────────────────────────── */
  async function finalize() {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setPhase("uploading");
    setLivePoseHint("Validation et envoi...");
    if (!user) {
      setErrorMsg("Vous devez être connecté pour soumettre la vérification");
      setPhase("error");
      return;
    }

    let videoBlob: Blob | null = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      const rec = recorderRef.current;
      const stopPromise = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
      });
      rec.stop();
      await stopPromise;
      if (recordedChunksRef.current.length > 0) {
        videoBlob = new Blob(recordedChunksRef.current, {
          type: rec.mimeType || "video/webm",
        });
      }
    }

    // Fall back to a still capture if MediaRecorder is missing.
    if (!frontSnapshotRef.current && videoRef.current) {
      try {
        frontSnapshotRef.current = await canvasSnapshot(videoRef.current);
      } catch {
        // ignore
      }
    }

    try {
      const imgFile = new File(
        [frontSnapshotRef.current ?? new Blob([])],
        `liveness-${Date.now()}.jpg`,
        { type: "image/jpeg" },
      );
      const imgRes = await uploadToBucket(imgFile, user.id, "kyc");

      let videoUrl = imgRes.url;
      if (videoBlob && videoBlob.size > 0) {
        const ext = (videoBlob.type.split("/")[1] || "webm").split(";")[0];
        const vidFile = new File(
          [videoBlob],
          `liveness-${Date.now()}.${ext}`,
          { type: videoBlob.type || "video/webm" },
        );
        const vidRes = await uploadToBucket(vidFile, user.id, "kyc");
        videoUrl = vidRes.url;
      }

      stopAll();
      setPhase("done");
      onComplete({ videoUrl, imageUrl: imgRes.url });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Échec de l'envoi du selfie";
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  function stopAll() {
    stoppedRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function restart() {
    stopAll();
    setPhase("boot");
    setStepIdx(0);
    setCompletedSteps(new Set());
    setProgress(0);
    heldSinceRef.current = null;
    recordedChunksRef.current = [];
    frontSnapshotRef.current = null;
    stoppedRef.current = false;
    // Re-run effects by toggling a key on the parent? Simplest: reload
    // the page. But that's heavy. Better: just re-run boot manually —
    // but useEffect tied to []. Easiest: full re-mount via parent key.
    // For now, ask the user to refresh — they can re-trigger by tapping
    // the trigger button again from the host page.
    if (onCancel) onCancel();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden bg-black ring-2 ring-[var(--border)]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // Mirror the preview so left/right matches the user's body —
          // raw camera shows them flipped, which is confusing during
          // a "tournez à droite" instruction.
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {phase === "boot" && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-sm">
            <Loader2 className="h-5 w-5 mr-2 animate-spin text-[var(--gold)]" />
            {livePoseHint}
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white text-sm p-6 text-center gap-3">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <div className="font-bold">Impossible d&apos;initialiser la caméra</div>
            <div className="text-xs text-white/80">{errorMsg}</div>
            {onCancel && (
              <Button size="sm" variant="secondary" onClick={onCancel}>
                Retour
              </Button>
            )}
          </div>
        )}

        {phase === "uploading" && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-white text-sm">
            <Loader2 className="h-5 w-5 mr-2 animate-spin text-[var(--gold)]" />
            Envoi en cours...
          </div>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 bg-emerald-500/30 backdrop-blur-sm flex flex-col items-center justify-center text-white text-sm">
            <div className="h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center mb-2">
              <Check className="h-7 w-7" strokeWidth={3} />
            </div>
            <div className="font-bold">Selfie validé</div>
          </div>
        )}

        {phase === "running" && (
          <>
            {/* Live overlay — current step + pose hint */}
            <div className="absolute top-3 inset-x-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white text-[11px] font-bold">
                <Camera className="h-3 w-3 text-[var(--gold)]" />
                {stepIdx + 1} / {totalSteps}
              </span>
            </div>

            {/* Centre instruction */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-black/55 backdrop-blur-md border-2 border-[var(--gold)] flex items-center justify-center">
                <currentStep.Icon className="h-8 w-8 text-[var(--gold)]" />
              </div>
              <div className="px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md text-white text-[13px] font-extrabold leading-tight text-center">
                {currentStep.label}
              </div>
            </div>

            {/* Bottom hint + progress bar */}
            <div className="absolute inset-x-0 bottom-0 p-3 space-y-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              <div className="text-[11px] text-white/85 text-center">
                {livePoseHint}
              </div>
              <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-[var(--gold)] transition-[width] duration-100"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Step list */}
      <ol className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {STEPS.map((s, i) => {
          const done = completedSteps.has(s.id);
          const active = phase === "running" && i === stepIdx;
          return (
            <li
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                active ? "bg-[var(--gold-faint)]" : ""
              }`}
            >
              <span
                className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-[var(--gold)] text-black animate-pulse"
                      : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
                }`}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : (
                  <s.Icon className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[13px] font-semibold leading-tight ${
                    done
                      ? "line-through text-[var(--foreground-muted)]"
                      : active
                        ? "text-[var(--gold)]"
                        : ""
                  }`}
                >
                  {s.label}
                </div>
                {!done && (
                  <div className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                    {s.hint}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {phase === "error" && (
        <Button size="md" fullWidth variant="secondary" onClick={restart}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ───────────────────────────────────────────────────────────────────────── */

interface FaceLandmarks68Like {
  positions: { x: number; y: number }[];
}

function computeYaw(landmarks: FaceLandmarks68Like): number {
  // 68-landmark layout: index 2 = jaw far-left, 14 = jaw far-right,
  // 30 = nose tip. Negative result → user turned to their right (which
  // appears as rightward on the mirrored preview too).
  const jl = landmarks.positions[2];
  const jr = landmarks.positions[14];
  const nose = landmarks.positions[30];
  if (!jl || !jr || !nose) return 0;
  const center = (jl.x + jr.x) / 2;
  const half = (jr.x - jl.x) / 2;
  if (half <= 0) return 0;
  return (nose.x - center) / half;
}

function stepPasses(
  step: StepId,
  yaw: number,
): { ok: boolean; hint: string } {
  // Preview is mirrored — when the user turns to their right, on the
  // un-mirrored video frame the nose moves to the user's right side
  // (positive x in the original 68-landmark frame). We compare against
  // the un-mirrored coordinate space.
  const abs = Math.abs(yaw);
  if (step === "front") {
    if (abs < FRONT_YAW_MAX) return { ok: true, hint: "Bien centré" };
    return { ok: false, hint: "Centrez votre visage" };
  }
  if (step === "right") {
    // User's right = positive yaw in 68-landmark space
    if (yaw > SIDE_YAW_MIN) return { ok: true, hint: "Maintenez la position" };
    return { ok: false, hint: "Tournez plus la tête à droite" };
  }
  // left
  if (yaw < -SIDE_YAW_MIN) return { ok: true, hint: "Maintenez la position" };
  return { ok: false, hint: "Tournez plus la tête à gauche" };
}

async function canvasSnapshot(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth || 720;
  const h = video.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("BLOB_FAILED"))),
      "image/jpeg",
      0.85,
    );
  });
}

function pickRecorderMime(): string | null {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}
