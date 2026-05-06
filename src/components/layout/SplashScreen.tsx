// Server component — emits a fixed-position black overlay with the splash
// image inside. Lifecycle is 100% CSS-driven (animation runs once and
// ends with opacity:0 + pointer-events:none), so there's no React state
// or inline <script> to trip the hydrator.
//
// The session-gate (skip on repeat visits in the same session) lives in
// layout.tsx as a <Script strategy="beforeInteractive"> — that's the
// Next.js-supported way to inject pre-hydration JS without React stripping
// the tag.
//
// Lifecycle (CSS):
//   t=0       black panel painted, opacity 1, image fading in
//   t=0..800ms image fades 0 → 1
//   t=800..3000ms hold fully visible
//   t=3000..3700ms whole panel fades 1 → 0
//   t=3700ms+ opacity 0, pointer-events none (still in DOM, invisible)
export function SplashScreen() {
  return (
    <div id="mazed-splash" aria-hidden="true">
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
