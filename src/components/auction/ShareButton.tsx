"use client";

import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Round ghost share button for the auction detail surfaces. Uses the
 * native share sheet when the browser exposes one (mobile), otherwise
 * copies the page URL to the clipboard and confirms with a toast.
 */
export function ShareButton({ title, url }: { title: string; url?: string }) {
  const { toast } = useToast();

  const onShare = async () => {
    // Resolved at click time so the server-rendered tree doesn't need
    // to know the absolute URL.
    const shareUrl = url ?? window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch (e) {
        // User dismissed the native sheet — not a failure, no fallback.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Anything else (NotAllowedError…) → fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("Lien copié", "success");
    } catch {
      toast("Impossible de copier le lien", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label="Partager"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:border-gold-soft/60 hover:text-gold active:scale-95"
    >
      <Share2 className="size-4" strokeWidth={2} />
    </button>
  );
}
