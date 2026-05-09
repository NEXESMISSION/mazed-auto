"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { uploadToBucket } from "@/lib/upload";

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
}

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
}: BaseProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function open() {
    if (uploading || disabled) return;
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const { url } = await uploadToBucket(f, user.id, folder);
      onCaptured(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
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
