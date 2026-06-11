import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Vous êtes hors ligne — Mazed Auto",
  description:
    "Aucune connexion Internet. Vérifiez votre réseau et réessayez pour retrouver les enchères Mazed Auto.",
};

// Fully static so the service worker can precache /fr/offline as a stable
// document and serve it when a navigation fails offline (see public/sw.js).
export const dynamic = "force-static";

/**
 * Branded offline fallback. Deliberately self-contained: the MA mark is
 * inlined as SVG (zero network), the copy is plain text, and "Réessayer"
 * is an <a href=""> — the empty href re-navigates to the *current* URL
 * (the page the user actually wanted, since the SW serves this document
 * in its place), and it works even if the JS bundles aren't cached.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col items-center justify-center px-6 py-14 text-center">
      {/* Gold MA mark — inline copy of /icons/icon.svg, tokenized. */}
      <svg
        viewBox="0 0 512 512"
        className="size-16"
        role="img"
        aria-label="Mazed Auto"
      >
        <rect width="512" height="512" rx="104" fill="var(--surface-2)" />
        <rect
          x="6"
          y="6"
          width="500"
          height="500"
          rx="98"
          fill="none"
          stroke="var(--border)"
          strokeWidth="12"
        />
        <path
          d="M112 380 V150 H170 L256 296 L342 150 H400 V380 H344 V244 L272 366 H240 L168 244 V380 Z"
          fill="var(--gold)"
        />
      </svg>

      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-gold ring-1 ring-gold/30">
        <WifiOff className="size-3.5" strokeWidth={2.4} />
        Hors ligne
      </span>

      <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-foreground">
        Vous êtes hors ligne
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Impossible de joindre Mazed Auto pour le moment. Vérifiez votre
        connexion Internet et réessayez — les pages déjà visitées restent
        consultables hors ligne.
      </p>

      <a
        href=""
        className="mt-6 inline-flex h-11 w-full max-w-60 items-center justify-center rounded-full bg-[var(--gold)] px-6 text-[13px] font-bold text-white shadow-[var(--shadow-gold)] transition-all hover:bg-[var(--gold-bright)] active:scale-[0.98]"
      >
        Réessayer
      </a>
      {/* Intentional plain <a>: on a SW-served fallback document the Next
          client router is detached from the real route, so a hard
          navigation (intercepted by the service worker) is what we want. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-3 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        Retour à l&apos;accueil
      </a>
    </main>
  );
}
