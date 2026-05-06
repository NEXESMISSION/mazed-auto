"use client";

import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  text?: string;
  /** Optional path; defaults to current page. */
  path?: string;
  className?: string;
}

export function ShareButton({ title, text, path, className }: Props) {
  const { toast } = useToast();

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path ?? window.location.pathname}`
        : path ?? "";

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user cancelled, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié dans le presse-papiers", "success");
    } catch {
      toast("Échec de la copie", "error");
    }
  }

  return (
    <button
      onClick={share}
      aria-label="Partager"
      className={cn(
        "h-10 w-10 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors",
        className,
      )}
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}
