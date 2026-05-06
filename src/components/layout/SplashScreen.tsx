"use client";

import { useEffect, useState } from "react";

// Show on every page load (no sessionStorage gate). The image is `logo.png`
// (~138 KB) — much smaller than the original full-canvas `loading.png` so
// the splash paints almost instantly. The image is also preloaded from the
// document head in layout.tsx for first-byte appearance.
const VISIBLE_MS = 3000;
const FADE_MS = 700;

export function SplashScreen() {
  const [stage, setStage] = useState<"visible" | "fading" | "hidden">("visible");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t1 = setTimeout(() => setStage("fading"), VISIBLE_MS);
    const t2 = setTimeout(() => setStage("hidden"), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (stage === "hidden") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden"
      style={{
        opacity: stage === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: stage === "fading" ? "none" : "auto",
      }}
    >
      {/* Subtle gold halo behind the logo */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(212,175,55,0.25), transparent 65%)",
        }}
      />

      {/* Logo — small, centered, gentle scale-in */}
      <div className="relative z-10 animate-splash-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Mazed Auto"
          width={180}
          height={180}
          className="h-44 w-44 object-contain drop-shadow-[0_0_40px_rgba(212,175,55,0.45)]"
          decoding="sync"
          fetchPriority="high"
        />
      </div>

      {/* Wordmark below the logo */}
      <div className="relative z-10 mt-6 text-center">
        <div className="text-2xl font-extrabold tracking-tight gradient-gold-text">
          Mazed Auto
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.3em] font-bold text-[var(--foreground-muted)]">
          Enchères automobiles
        </div>
      </div>

      {/* Pulsing dots near the bottom */}
      <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <span className="splash-dot" />
        <span className="splash-dot splash-dot-2" />
        <span className="splash-dot splash-dot-3" />
      </div>

      <style>{`
        @keyframes splash-in {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-splash-in {
          animation: splash-in 600ms ease-out both;
        }
        @keyframes splash-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .splash-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--gold);
          box-shadow: 0 0 16px var(--gold-glow);
          animation: splash-pulse 1.2s ease-in-out infinite;
        }
        .splash-dot-2 { animation-delay: 0.18s; }
        .splash-dot-3 { animation-delay: 0.36s; }
      `}</style>
    </div>
  );
}
