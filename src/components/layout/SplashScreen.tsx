"use client";

import { useEffect, useRef, useState } from "react";
import { SPLASH_LQIP } from "./splash-lqip";

const MIN_DISPLAY_MS = 1000;

/**
 * Full-bleed branded splash that paints with the very first HTML byte.
 *
 * Layered for perceived speed:
 *   1. Inline 24-px blurred LQIP (base64, ~520 chars) → paints with the
 *      HTML itself, ZERO network round-trips. CSS `::before` with the
 *      data URL handles it.
 *   2. /loading.webp (22 KB, was 69 KB JPG) → swaps in once decoded.
 *      Faster TTFB even on a cold cache.
 *   3. /loading.jpg → kept as fallback for browsers without WebP.
 *
 * Lifecycle:
 *   t=0           LQIP + panel painted (no network)
 *   t≈100..400ms  real image arrives → onLoad flips data-img-loaded → LQIP fades out
 *   t=1000ms      effect flips data-hidden=true
 *   t=1300ms      panel invisible + non-interactive
 *
 * Belt-and-braces: a 5s no-JS CSS animation drops the panel even if
 * the effect never runs.
 */
export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.dataset.hidden = "true";
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      id="mazed-splash"
      ref={ref}
      aria-hidden="true"
      // Inline the LQIP as a CSS variable on the panel itself. globals.css
      // uses `background-image: var(--splash-lqip)` on the ::before layer,
      // so the placeholder paints with the first byte of HTML.
      style={{ ["--splash-lqip" as never]: `url(${SPLASH_LQIP})` }}
      data-img-loaded={imgLoaded ? "true" : undefined}
    >
      {/* <picture> ships both WebP + JPG. Modern browsers (all of them
          in practice) pick WebP, the rest fall back. */}
      <picture>
        <source srcSet="/loading.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/loading.jpg"
          alt="Mazed Auto"
          decoding="async"
          fetchPriority="high"
          onLoad={() => setImgLoaded(true)}
        />
      </picture>
    </div>
  );
}
