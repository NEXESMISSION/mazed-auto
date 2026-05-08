"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

interface Props {
  /** Visual frame guide */
  frame?: "id-card" | "selfie" | "vehicle";
  /** Helper text under frame */
  hint?: string;
  /** Called when the capture is finalized (uploaded URL or local data URL). */
  onCapture: (url: string) => void;
  /**
   * If true, the captured file is uploaded to Supabase Storage and the
   * resulting public URL is passed to onCapture. If false, this component
   * just hands back a local data URL — used by the simulated KYC flow.
   */
  upload?: boolean;
  /**
   * Folder prefix inside the user's bucket (e.g. "auctions/<id>", "carte-grise").
   * Required when upload=true.
   */
  folder?: string;
}

/**
 * Capture flow with NO confirmation step. Tap the button → device camera
 * opens → user takes shot → we upload immediately and call onCapture. The
 * preview is shown only during the upload so the user sees what they
 * captured. A Retake button appears only on failure.
 */
export function CameraCapture({
  frame = "id-card",
  hint,
  onCapture,
  upload = false,
  folder = "misc",
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile() {
    setFailed(false);
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const localUrl = URL.createObjectURL(f);
    setPreview(localUrl);

    if (!upload) {
      onCapture(localUrl);
      return;
    }
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      setFailed(true);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, f, {
        contentType: f.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      setUploading(false);
      setFailed(true);
      toast("Échec du téléversement de la photo : " + error.message, "error");
      return;
    }

    const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
    setUploading(false);
    onCapture(data.publicUrl);
  }

  function retake() {
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setFailed(false);
    if (inputRef.current) inputRef.current.value = "";
    pickFile();
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={frame === "selfie" ? "user" : "environment"}
        onChange={onFile}
        className="hidden"
      />

      <div className="relative aspect-[4/3] rounded-[var(--radius-md)] overflow-hidden bg-black border border-[var(--border)]">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="captured"
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, #0f0f0f 0%, #050505 100%)",
              }}
            />
            <FrameGuide frame={frame} />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur text-[10px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>
          </>
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

      {hint && !preview && (
        <p className="text-xs text-center text-[var(--foreground-muted)]">
          {hint}
        </p>
      )}

      {failed ? (
        <Button size="lg" fullWidth onClick={retake}>
          <RotateCcw className="h-4 w-4" />
          Réessayer
        </Button>
      ) : !preview ? (
        <Button size="xl" fullWidth onClick={pickFile}>
          <Camera className="h-5 w-5" />
          Prendre la photo
        </Button>
      ) : null}
    </div>
  );
}

function FrameGuide({ frame }: { frame: Props["frame"] }) {
  if (frame === "selfie") {
    return (
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 75"
        preserveAspectRatio="none"
      >
        <ellipse
          cx="50"
          cy="37.5"
          rx="20"
          ry="28"
          fill="none"
          stroke="rgba(212,175,55,0.7)"
          strokeWidth="0.5"
          strokeDasharray="2,1"
        />
      </svg>
    );
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full"
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
      <text
        x="50"
        y="65"
        textAnchor="middle"
        fill="rgba(212,175,55,0.5)"
        fontSize="3"
        fontFamily="sans-serif"
      >
        Placez la carte dans le cadre
      </text>
    </svg>
  );
}
