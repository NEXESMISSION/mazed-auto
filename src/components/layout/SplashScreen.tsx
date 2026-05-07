"use client";

import { useEffect, useState } from "react";

// JS-driven splash. Server-renders visible (so it paints with the very
// first HTML byte, no white flash) and a useEffect timer flips
// data-hidden after a fixed minimum hold so the fade timing is
// deterministic across cold loads — instead of relying on CSS-animation
// timing which varies based on when CSS parses (cached vs fresh).
//
// Fallback: a CSS keyframe in globals.css forces opacity:0 at 5s
// regardless of JS, so a hydration failure can't trap users behind
// the splash.
//
// Lifecycle:
//   t=0       splash visible, app paints behind it
//   t=1000ms  data-hidden flips → CSS transition starts
//   t=1300ms  fully invisible + pointer-events:none
const MIN_DISPLAY_MS = 1000;

export function SplashScreen() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHidden(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div id="mazed-splash" aria-hidden="true" data-hidden={hidden}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/loading.png"
        alt="Mazed Auto"
        decoding="sync"
        fetchPriority="high"
      />
    </div>
  );
}
