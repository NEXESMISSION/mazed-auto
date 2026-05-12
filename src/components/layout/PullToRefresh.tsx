"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const TAG = "[PTR]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
   
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}

// Distance the user has to drag before a release triggers a refresh.
// Tuned for a deliberate "long slide down" — short pulls were
// triggering accidental refreshes when users scrolled up at the top.
const TRIGGER_PX = 160;
// Hard cap on how far the indicator can slide.
const MAX_PULL_PX = 240;
// Resistance: each finger-pixel contributes ~55% of the indicator
// offset. Slightly heavier than 1:1 so the gesture feels weighted.
const RESISTANCE = 0.55;
// Minimum dy before we steal the gesture (jitter guard). Also acts as
// the only protection against tap-on-button-being-mistaken-for-pull —
// 12 px of intentional vertical movement is enough that a real tap
// (which barely moves the finger) doesn't trip the gesture, but any
// real swipe registers immediately. A previous version also gated by
// "touch must start in the top 140 px", which made the PTR feel
// broken — users couldn't grab the page anywhere and pull it down.
const ACTIVATION_DY_PX = 12;

/**
 * Native-feeling pull-to-refresh. Mounted in AppShell.
 *
 *  - Listens only when the document is at the very top.
 *  - Translates touch dy into a damped vertical offset on a top-anchored
 *    indicator (gold spinner inside a circle pill).
 *  - Past TRIGGER_PX, the spinner snaps to "ready" and a release fires
 *    `router.refresh()` (Next.js soft revalidation).
 *  - Touch-only — mouse drag won't fire it. Test on a phone or in the
 *    browser DevTools "device toolbar" mode.
 *
 * Implementation note: listeners are bound ONCE on mount and read live
 * state via refs. An earlier version had `[pull, refreshing, router]`
 * in the useEffect deps, which re-bound the listeners on every
 * touchmove (since setPull updates `pull` mid-gesture). During the
 * cleanup-then-rebind gap, intermediate touch events were being
 * dropped — exactly when the user expected the indicator to keep
 * sliding. Listeners now stay stable for the lifetime of the component.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // All gesture state lives in refs so the once-bound listeners can
  // read the latest values without needing to be re-bound.
  const startYRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  // Mirror state into refs whenever React commits — listeners read these.
  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    log("PTR mounted", {
      trigger: TRIGGER_PX,
      maxPull: MAX_PULL_PX,
      resistance: RESISTANCE,
    });

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      // The only gate is "page is at the very top". Without that, a
      // downward swipe mid-page should scroll, not refresh. Touch
      // location anywhere on the page is fine — the 12-px activation
      // threshold below filters out accidental taps on buttons.
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 0) {
        armedRef.current = false;
        startYRef.current = null;
        return;
      }
      armedRef.current = true;
      startYRef.current = t.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (!armedRef.current || startYRef.current === null) return;
      if (refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startYRef.current;
      if (dy < ACTIVATION_DY_PX) {
        // Allow the browser's native scroll on small jitter — we don't
        // commit yet, so don't preventDefault.
        return;
      }
      const damped = Math.min(dy * RESISTANCE, MAX_PULL_PX);
      const wasReady = pullRef.current >= TRIGGER_PX;
      const isReady = damped >= TRIGGER_PX;
      pullRef.current = damped;
      setPull(damped);
      // Tactile cue at the moment the threshold is crossed (forward
      // direction only — don't buzz when sliding back below). On
      // browsers without the Vibration API this is a silent no-op.
      if (isReady && !wasReady && typeof navigator !== "undefined") {
        navigator.vibrate?.(12);
      }
      // Suppress the document's own bounce/scroll while we own the gesture.
      if (e.cancelable) e.preventDefault();
    }

    async function onTouchEnd() {
      if (!armedRef.current || refreshingRef.current) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      armedRef.current = false;
      const finalPull = pullRef.current;
      const triggered = finalPull >= TRIGGER_PX;
      log("touchend", {
        pullPx: Math.round(finalPull),
        triggerPx: TRIGGER_PX,
        triggered,
      });
      if (triggered) {
        refreshingRef.current = true;
        setRefreshing(true);
        pullRef.current = TRIGGER_PX;
        setPull(TRIGGER_PX);
        try {
          router.refresh();
          log("router.refresh() invoked");
        } finally {
          setTimeout(() => {
            refreshingRef.current = false;
            setRefreshing(false);
            pullRef.current = 0;
            setPull(0);
          }, 700);
        }
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    // passive: false on touchmove so preventDefault() actually works.
    // touchstart/end can be passive (we don't preventDefault there).
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      log("PTR unmounted");
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
    // Empty deps — the router ref is stable enough for this; if the
    // app's router instance ever changes mid-life, we'd need to re-bind
    // anyway, but in practice it doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = pull > 0 || refreshing;
  const ready = pull >= TRIGGER_PX || refreshing;
  const progress = Math.min(pull / TRIGGER_PX, 1);
  // Slightly overshoot at the threshold for a satisfying "snap" pulse —
  // the indicator briefly inflates 1.0 → 1.18 → 1.0 the moment progress
  // crosses 1, matching the haptic buzz fired in onTouchMove.
  const scale = ready ? 1 + (1 - Math.abs(progress - 1)) * 0.18 + 0.04 : 1;

  // Circular ring math: 56-px circle, stroke radius 24, circumference
  // 2πr = 150.8. dashoffset shrinks from `circ` → 0 as progress 0 → 1.
  const RING_R = 24;
  const RING_C = 2 * Math.PI * RING_R;
  const dashOffset = RING_C * (1 - progress);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translate3d(0, ${visible ? pull - 70 : -100}px, 0)`,
        // Spring-back ease on release (back-out), no easing while dragging.
        transition:
          refreshing || pull === 0
            ? "transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "none",
      }}
    >
      <div
        className="relative h-14 w-14"
        style={{
          transform: `scale(${scale})`,
          transition: "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Soft outer glow that intensifies as the user nears the
            threshold and stays bright while refreshing. */}
        <div
          className="absolute inset-[-8px] rounded-full transition-opacity duration-200"
          style={{
            background:
              "radial-gradient(closest-side, var(--gold-glow) 0%, transparent 70%)",
            opacity: ready ? 0.95 : progress * 0.5,
          }}
        />

        {/* Background pill — holds the icon. */}
        <div
          className="absolute inset-0 rounded-full bg-[var(--surface)] border shadow-[0_10px_28px_rgba(0,0,0,0.55)] flex items-center justify-center transition-colors duration-150"
          style={{
            borderColor: ready ? "var(--gold)" : "var(--border-strong)",
          }}
        >
          <RefreshCw
            className="h-5 w-5"
            style={{
              color: ready ? "var(--gold-bright)" : "var(--gold)",
              transform: refreshing
                ? undefined
                : `rotate(${progress * 360}deg)`,
              transition: refreshing
                ? undefined
                : "color 150ms ease-out",
              animation: refreshing ? "spin 0.8s linear infinite" : undefined,
            }}
          />
        </div>

        {/* SVG circular progress ring — fills clockwise as the user pulls.
            Sits on top of the pill so the gold arc is clearly visible
            against the dark background. While refreshing, we hide the
            arc and let the spinning icon carry the loading state. */}
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 56 56"
          style={{ opacity: refreshing ? 0 : 1, transition: "opacity 200ms" }}
        >
          <circle
            cx="28"
            cy="28"
            r={RING_R}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 80ms linear",
              filter: ready
                ? "drop-shadow(0 0 6px var(--gold-glow))"
                : undefined,
            }}
          />
        </svg>
      </div>
    </div>
  );
}
