"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const TAG = "[PTR]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
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
// Touch must START within this many pixels of the viewport top.
const TOP_ZONE_PX = 140;
// Minimum dy before we steal the gesture (jitter guard).
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
      topZone: TOP_ZONE_PX,
      resistance: RESISTANCE,
    });

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const y = t.clientY;
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 0 || y > TOP_ZONE_PX) {
        armedRef.current = false;
        startYRef.current = null;
        log("touchstart REJECTED", {
          scrollY,
          y: Math.round(y),
          topZone: TOP_ZONE_PX,
          reason: scrollY > 0 ? "page scrolled" : "touch below top zone",
        });
        return;
      }
      armedRef.current = true;
      startYRef.current = y;
      log("touchstart ARMED", { y: Math.round(y) });
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
      pullRef.current = damped;
      setPull(damped);
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

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translate3d(0, ${visible ? pull - 56 : -80}px, 0)`,
        transition: refreshing || pull === 0 ? "transform 220ms ease-out" : "none",
      }}
    >
      <div
        className="h-11 w-11 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center"
        style={{
          opacity: Math.max(0.5, progress),
          borderColor: ready ? "var(--gold)" : "var(--border)",
          boxShadow: ready
            ? "0 0 0 3px var(--gold-faint), 0 8px 24px rgba(0,0,0,0.5)"
            : "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <RefreshCw
          className={
            "h-5 w-5 text-[var(--gold)]" +
            (refreshing ? " animate-spin" : "")
          }
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            transition: refreshing ? undefined : "none",
          }}
        />
      </div>
    </div>
  );
}
