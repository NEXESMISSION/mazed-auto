"use client";

import { useState } from "react";
import { Play, X, ArrowRight } from "lucide-react";

interface Props {
  url: string;
  /** Optional poster image (a vehicle photo works well as the still frame). */
  poster?: string;
}

/**
 * Click-to-play video for the auction page. Renders a card matching the
 * surrounding design; tapping it opens a fullscreen-ish modal with a native
 * <video> player. Auto-pauses + resets on close so reopening starts clean.
 */
export function VideoButton({ url, poster }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)]/50 transition-colors group text-start"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full gradient-gold flex items-center justify-center text-black shadow-[var(--shadow-gold)] group-hover:scale-105 transition-transform">
            <Play className="h-4 w-4 fill-current ms-0.5" />
          </div>
          <div>
            <div className="font-bold text-sm">Voir la vidéo</div>
            <div className="text-xs text-[var(--foreground-muted)]">
              Visite de 60 secondes
            </div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-[var(--foreground-muted)] group-hover:text-[var(--gold)] transition-colors" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-label="Fermer"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-[var(--radius-md)] overflow-hidden bg-black shadow-[0_20px_80px_rgba(0,0,0,0.8)]"
          >
            <video
              key={url}
              src={url}
              poster={poster}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="w-full h-auto max-h-[80vh] bg-black"
            >
              Votre navigateur ne prend pas en charge la lecture vidéo.
            </video>
          </div>
        </div>
      )}
    </>
  );
}
