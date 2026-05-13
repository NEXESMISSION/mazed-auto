"use client";

import { useEffect, useState } from "react";
import { Play, X, VideoOff, ArrowRight } from "lucide-react";

interface Props {
  /** Public URL of the walkaround video, or null/empty when the seller
   *  didn't upload one. The component renders an "Aucune vidéo" placeholder
   *  in that case so the user knows the lack of video is intentional, not
   *  a missing widget. */
  url: string | null | undefined;
  /** Optional poster image (a vehicle photo works well as the still frame). */
  poster?: string;
}

/**
 * Auction-page video widget.
 *
 *   url present → click-to-play card that opens a centered modal with a
 *                 native <video>.
 *   url absent  → muted card "Aucune vidéo disponible" so the section
 *                 layout stays consistent and the user doesn't wonder if
 *                 we're hiding something.
 */
export function VideoButton({ url, poster }: Props) {
  const [open, setOpen] = useState(false);
  const hasVideo = Boolean(url && url.trim());

  // Lock body scroll while the modal is open + close on Esc. Both
  // behaviours are obvious enough that omitting them feels broken.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasVideo) {
    return (
      <div className="w-full flex items-center justify-between p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] opacity-70">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center shrink-0">
            <VideoOff className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm">Aucune vidéo</div>
            <div className="text-xs text-[var(--foreground-muted)]">
              Ce vendeur n&apos;a pas joint de visite vidéo
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)]/50 transition-colors group text-start"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-full gradient-gold flex items-center justify-center text-black shadow-[var(--shadow-gold)] group-hover:scale-105 transition-transform shrink-0">
            <Play className="h-4 w-4 fill-current ms-0.5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm">Voir la vidéo</div>
            <div className="text-xs text-[var(--foreground-muted)]">
              Visite vidéo du véhicule
            </div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-[var(--foreground-muted)] group-hover:text-[var(--gold)] transition-colors shrink-0" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Lecteur vidéo"
          className="
            fixed inset-0 z-[100]
            bg-black/95 backdrop-blur-md
            flex items-center justify-center
            p-4 pt-[max(1rem,env(safe-area-inset-top))]
            pb-[max(1rem,env(safe-area-inset-bottom))]
            animate-in fade-in duration-150
          "
        >
          {/* Close — fixed in the screen corner so it's reachable no
              matter how the video shape ends up. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-label="Fermer"
            className="
              fixed top-3 end-3 z-[101]
              h-11 w-11 rounded-full
              bg-white/10 hover:bg-white/20 backdrop-blur-md
              ring-1 ring-white/20
              text-white
              flex items-center justify-center
              active:scale-95 transition-all
            "
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>

          {/* Player — true center on every viewport, scales down to fit
              both vertical and horizontal screen space. Stops click
              propagation so tapping the player doesn't close. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl flex items-center justify-center"
          >
            <video
              key={url ?? undefined}
              src={url ?? undefined}
              poster={poster}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="
                w-full max-h-[85vh]
                object-contain
                rounded-[var(--radius-md)]
                bg-black
                shadow-[0_30px_120px_rgba(0,0,0,0.8)]
              "
            >
              Votre navigateur ne prend pas en charge la lecture vidéo.
            </video>
          </div>
        </div>
      )}
    </>
  );
}
