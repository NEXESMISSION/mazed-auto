"use client";

import { useEffect, useRef } from "react";

// Minimum time the splash stays visible regardless of how fast hydration
// finishes. Keeps the brand moment from feeling like a flicker.
const MIN_DISPLAY_MS = 1000;

/**
 * Splash screen rendered with the very first HTML byte. The image is the
 * compact /logo.png (~135 KB) instead of the previous full-bleed
 * /loading.png (~2.9 MB) — the big asset didn't reliably finish loading
 * before the dark panel painted, which is what caused the "image pops in
 * suddenly" complaint. Logo arrives in one HTTP round-trip and gets a
 * 200ms fade-in (CSS) on top of the instantly-painted black panel.
 *
 * Lifecycle (mostly CSS, MIN_DISPLAY_MS gate in JS):
 *   t=0           panel painted opaque + image starts fade-in
 *   t=50..250ms   image fades 0 → 1
 *   t=1000ms      effect flips data-hidden=true, panel transitions
 *                 opacity 1 → 0 over 300ms (CSS transition)
 *   t=1300ms      panel invisible + non-interactive
 *
 * Belt-and-braces: if JS never hydrates (rare), a 5s CSS fallback
 * animation forces the panel to fade so users aren't trapped.
 */
export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.dataset.hidden = "true";
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div id="mazed-splash" ref={ref} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Mazed Auto"
        width={140}
        height={140}
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  );
}
