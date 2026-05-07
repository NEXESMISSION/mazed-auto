// Server component — emits a fixed-position black overlay with the splash
// image inside. Lifecycle is 100% CSS-driven (animation runs once and
// ends with opacity:0 + pointer-events:none), so there's no React state
// or inline <script> to trip the hydrator.
//
// Lifecycle (CSS, total 1100ms):
//   t=0          black panel + preloaded image both visible at full opacity
//   t=0..800ms   hold
//   t=800..1100ms whole panel fades 1 → 0 (300ms)
//   t=1100ms+    opacity 0, pointer-events none (still in DOM, invisible)
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
