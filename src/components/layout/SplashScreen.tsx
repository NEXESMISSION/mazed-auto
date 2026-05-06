"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mazed_splash_shown";
const VISIBLE_MS = 2200;
const FADE_MS = 700;

export function SplashScreen() {
  const [stage, setStage] = useState<"hidden" | "visible" | "fading">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    sessionStorage.setItem(STORAGE_KEY, "1");
    setStage("visible");
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
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden"
      style={{
        opacity: stage === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: stage === "fading" ? "none" : "auto",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/loading.png"
        alt="Mazed Auto"
        className="absolute inset-0 w-full h-full object-contain animate-splash-in"
        decoding="sync"
        fetchPriority="high"
      />
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 flex items-center gap-2">
        <span className="splash-dot" />
        <span className="splash-dot splash-dot-2" />
        <span className="splash-dot splash-dot-3" />
      </div>
      <style>{`
        @keyframes splash-in {
          0% { opacity: 0; transform: scale(0.98); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-splash-in {
          animation: splash-in 500ms ease-out both;
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
