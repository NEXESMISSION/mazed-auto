"use client";

import { useEffect, useRef } from "react";

const MIN_DISPLAY_MS = 1000;

/**
 * Full-bleed branded splash that paints with the very first HTML byte.
 * Uses /loading.jpg — a 70 KB JPG (was 2.94 MB PNG) so it actually
 * arrives before the splash holds expire on a cold cache. The service
 * worker also precaches the file (see public/sw.js), so subsequent
 * loads — including the installed PWA — paint instantly from cache.
 *
 * Lifecycle:
 *   t=0           panel + image painted
 *   t=0..200ms    image fades in (CSS, in case the image hasn't fully
 *                 decoded yet on the very first cold visit)
 *   t=1000ms      effect flips data-hidden=true
 *   t=1000..1300ms panel transitions opacity 1 → 0 (CSS)
 *   t=1300ms      panel invisible + non-interactive
 *
 * Belt-and-braces: a 5s no-JS CSS animation drops the panel even if
 * the effect never runs.
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
        src="/loading.jpg"
        alt="Mazed Auto"
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  );
}
