"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

interface Props {
  /** Visual frame guide */
  frame?: "id-card" | "selfie" | "vehicle";
  /** Helper text under frame */
  hint?: string;
  /** Called when user confirms a captured shot — receives the public URL */
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
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Cleanup blob URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile() {
    inputRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setAnalyzing(true);
    // Quick "checking quality" UX touch
    setTimeout(() => setAnalyzing(false), 500);
  }

  function retake() {
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirm() {
    if (!preview) return;

    if (!upload) {
      // Simulated path (KYC etc.) — just hand back the preview URL
      onCapture(preview);
      return;
    }

    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }
    if (!file) {
      toast("Aucune photo à téléverser", "error");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      setUploading(false);
      toast("Échec du téléversement de la photo : " + error.message, "error");
      return;
    }

    const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
    setUploading(false);
    onCapture(data.publicUrl);
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

        {(analyzing || uploading) && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-sm font-semibold">
                {uploading ? "Téléversement..." : "Vérification..."}
              </div>
            </div>
          </div>
        )}
      </div>

      {hint && !preview && (
        <p className="text-xs text-center text-[var(--foreground-muted)]">
          {hint}
        </p>
      )}

      {preview ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={retake}
            disabled={uploading}
          >
            <RotateCcw className="h-4 w-4" />
            Recommencer
          </Button>
          <Button size="lg" fullWidth onClick={confirm} disabled={uploading}>
            <Check className="h-5 w-5" />
{uploading ? "Téléversement..." : "Utiliser"}
          </Button>
        </div>
      ) : (
        <Button size="xl" fullWidth onClick={pickFile}>
          {upload ? <Upload className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
{upload ? "Choisir ou prendre une photo" : "Prendre la photo"}
        </Button>
      )}
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
