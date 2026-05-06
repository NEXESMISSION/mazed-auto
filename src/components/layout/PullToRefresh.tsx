"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Distance the user has to drag before a release triggers a refresh.
const TRIGGER_PX = 90;
// Hard cap on how far the indicator can slide — keeps the rubber-band
// effect feeling snappy instead of letting users drag the page halfway down.
const MAX_PULL_PX = 140;
// Resistance factor: each finger-pixel of movement contributes 60% to the
// indicator's vertical offset. Without this the pull would feel 1:1, which
// is too eager.
const RESISTANCE = 0.6;
// Only activate PTR when the touch STARTS within this many pixels of the
// top of the viewport. Without this guard, taps on buttons mid-page that
// shift slightly during touch get hijacked into a pull, and the button
// click is suppressed. This is the standard fix for "buttons sometimes
// don't fire" when a global PTR listener is in play.
const TOP_ZONE_PX = 80;
// Minimum dy before we steal the gesture. Keeps tiny finger jitter on
// regular taps from registering as a pull.
const ACTIVATION_DY_PX = 12;

/**
 * Native-feeling pull-to-refresh. Wraps page content (mounted in AppShell).
 *
 * Behaviour:
 *  - Only listens when the document is scrolled to the very top.
 *  - Translates touch dy into a damped vertical offset on a top-anchored
 *    indicator (gold spinner inside a circle pill).
 *  - Past TRIGGER_PX, the spinner snaps to "ready" state.
 *  - On release past the threshold, fires `router.refresh()` (Next.js soft
 *    revalidation — server components re-fetch, client state preserved).
 *  - Touch-only (mouse drag is intentionally not wired up; PTR is a mobile
 *    pattern and bolting it on for desktop muddies the model).
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0); // current visual offset, 0..MAX_PULL_PX
  const [refreshing, setRefreshing] = useState(false);
  // Mutable touch state. Refs avoid re-rendering on every touchmove (which
  // would tank scroll perf).
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Only arm when:
      //  1. the page is at the very top (scrollY = 0), AND
      //  2. the touch STARTS in the top zone of the viewport.
      // Without (2), tapping a button anywhere on the page can be
      // interpreted as the start of a pull if the finger jitters, which
      // suppresses the click event. This is the root cause of "buttons
      // sometimes don't work."
      const y = e.touches[0].clientY;
      if (window.scrollY > 0 || y > TOP_ZONE_PX) {
        armed.current = false;
        startY.current = null;
        return;
      }
      armed.current = true;
      startY.current = y;
    }

    function onTouchMove(e: TouchEvent) {
      if (!armed.current || startY.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      // Don't steal the gesture until the user has moved meaningfully.
      // Otherwise tap-jitter on a button registers as a pull start.
      if (dy < ACTIVATION_DY_PX) {
        return;
      }
      // Damp the pull and clamp to MAX_PULL_PX so it never feels rubbery.
      const damped = Math.min(dy * RESISTANCE, MAX_PULL_PX);
      setPull(damped);
      // Once we're actively pulling, prevent the document from also
      // bounce-scrolling — the indicator IS the affordance.
      e.preventDefault();
    }

    async function onTouchEnd() {
      if (!armed.current || refreshing) {
        setPull(0);
        return;
      }
      armed.current = false;
      const triggered = pull >= TRIGGER_PX;
      if (triggered) {
        setRefreshing(true);
        // Snap to a fixed visible position while the refresh runs.
        setPull(TRIGGER_PX);
        try {
          router.refresh();
        } finally {
          // router.refresh() resolves quickly (it kicks off the work but
          // doesn't await every server component). Hold the spinner for a
          // beat so the user actually sees the feedback, then collapse.
          setTimeout(() => {
            setRefreshing(false);
            setPull(0);
          }, 700);
        }
      } else {
        setPull(0);
      }
    }

    // `passive: false` because we may call preventDefault() in touchmove.
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing, router]);

  // Visible iff the user is pulling or we're showing the post-trigger state.
  const visible = pull > 0 || refreshing;
  const ready = pull >= TRIGGER_PX || refreshing;
  // Progress (0..1) drives the spinner rotation while the user is dragging.
  const progress = Math.min(pull / TRIGGER_PX, 1);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{
        transform: `translate3d(0, ${visible ? pull - 56 : -80}px, 0)`,
        // No transition while the finger is actively dragging — would cause
        // lag. After release, smooth back to rest in 220ms.
        transition: refreshing || pull === 0 ? "transform 220ms ease-out" : "none",
      }}
    >
      <div
        className="h-11 w-11 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center"
        style={{
          opacity: Math.max(0.5, progress),
          // Mark the threshold being crossed by tinting the border + glow.
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
            // While dragging, rotate proportional to pull. After trigger,
            // CSS animation takes over (animate-spin).
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            transition: refreshing ? undefined : "none",
          }}
        />
      </div>
    </div>
  );
}
