"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { uploadToBucket } from "@/lib/upload";
import { compressImage, type CompressOptions } from "@/lib/imageCompress";

const TAG = "[NativeCapture]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}
function err(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.error(
    `%c${TAG} %c${ts}`,
    "color:#ef4444;font-weight:bold",
    "color:#888",
    ...args,
  );
}

interface BaseProps {
  /** "photo" → image/* | "video" → video/*. */
  kind: "photo" | "video";
  /** Front- or back-facing camera. Hint to the OS picker. */
  facing?: "user" | "environment";
  /** Sub-folder under the user's bucket (e.g. "auctions", "kyc"). */
  folder: string;
  /** Called with the public URL once the file is uploaded. */
  onCaptured: (url: string) => void;
  /** Optional override for the visible button label. */
  label?: string;
  /** Disable the trigger (during another in-flight action). */
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Render-prop alternative — when provided we don't render a button,
   *  the consumer renders whatever it wants and calls `open()`. */
  children?: (state: { open: () => void; uploading: boolean }) => React.ReactNode;
  /** Per-call image compression overrides. KYC docs pass higher quality
   *  so OCR text stays crisp; default preset is fine for vehicle
   *  photos. Ignored for `kind === "video"`. */
  compress?: CompressOptions;
  /** Optional pre-upload validation. Runs on the raw picked File before
   *  compression / upload. Return `{ ok: false, reason }` to abort and
   *  surface a toast — useful for things like video duration limits
   *  that would otherwise cost a round trip to discover. */
  validate?: (file: File) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

// Defaults per use case. Folder name is the source of truth for picking
// a preset since it already carries semantic meaning ("kyc" / "auctions"
// / "carte-grise") and avoids adding another prop at every call site.
const PRESETS: Record<string, CompressOptions> = {
  kyc:           { maxEdge: 2200, quality: 0.92 }, // OCR-friendly
  "carte-grise": { maxEdge: 2200, quality: 0.92 }, // OCR-friendly
  auctions:      { maxEdge: 1920, quality: 0.85 }, // standard listing
  default:       { maxEdge: 1920, quality: 0.85 },
};

/**
 * One-shot native capture. Tapping the trigger opens the device's OS
 * camera (the input element's `capture` attribute drives this on iOS and
 * Android). The user snaps and confirms inside the OS UI — no in-app
 * preview or extra "validate" button. The picked file is uploaded to
 * Supabase Storage and the public URL flows back via onCaptured.
 *
 * On desktop, the same input opens the platform's file picker — useful
 * for testing without a webcam.
 */
export function NativeCapture({
  kind,
  facing = "environment",
  folder,
  onCaptured,
  label,
  disabled,
  className,
  children,
  compress,
  validate,
}: BaseProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function open() {
    log("open()", { folder, kind, facing, disabled, uploading, hasUser: Boolean(user) });
    if (uploading || disabled) return;
    if (!user) {
      err("open() blocked — no user in context");
      toast("Connectez-vous d'abord", "warning");
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
      log("native input click dispatched");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    log("onFile", {
      hasFile: Boolean(f),
      name: f?.name,
      type: f?.type,
      size: f?.size,
      lastModified: f?.lastModified,
    });
    if (!f || !user) return;
    if (validate) {
      const v = await validate(f);
      if (!v.ok) {
        log("validate rejected", { reason: v.reason });
        toast(v.reason, "warning");
        return;
      }
    }
    setUploading(true);
    const t0 = performance.now();
    try {
      // Image-only client-side compression. Saves ~10-20× on bytes-on-
      // wire and Supabase storage cost vs. uploading raw 2-3 MB phone
      // captures. Videos pass through (browser doesn't transcode).
      let payload: File = f;
      if (kind === "photo" && f.type.startsWith("image/")) {
        const preset = compress ?? PRESETS[folder] ?? PRESETS.default;
        payload = await compressImage(f, preset);
        log("post-compress payload", {
          origKB: Math.round(f.size / 1024),
          newKB: Math.round(payload.size / 1024),
          preset,
        });
      }
      log("uploadToBucket → start", { folder, userId: user.id });
      const { url, path } = await uploadToBucket(payload, user.id, folder);
      const ms = Math.round(performance.now() - t0);
      log("uploadToBucket → done", { ms, url, path });
      onCaptured(url);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      err("uploadToBucket failed", { ms, error: e, message: msg });
      toast("Échec du téléversement : " + msg, "error");
    } finally {
      setUploading(false);
    }
  }

  const Icon = kind === "video" ? Video : Camera;
  const fallbackLabel = kind === "video" ? "Filmer" : "Prendre la photo";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={kind === "video" ? "video/*" : "image/*"}
        capture={facing}
        onChange={onFile}
        className="hidden"
      />
      {children ? (
        children({ open, uploading })
      ) : (
        <Button
          size="xl"
          fullWidth
          onClick={open}
          disabled={disabled || uploading}
          className={className}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
          {uploading ? "Téléversement…" : label ?? fallbackLabel}
        </Button>
      )}
    </>
  );
}
