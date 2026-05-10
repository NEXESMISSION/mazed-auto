"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const TAG = "[Swipe]";
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

// Order matters — left-to-right is the swipe sequence. We skip the
// center "Sell" tab on purpose (kicks off a multi-step creation flow
// that shouldn't be triggered by a casual gesture).
const SWIPE_TABS = ["/", "/auctions", "/buyer/bids", "/profile"];

// Pull the locale prefix off the pathname before matching, since
// next-intl rewrites every URL to /fr/* or /ar/*.
function stripLocale(p: string): string {
  return p.replace(/^\/(fr|ar)(?=\/|$)/, "") || "/";
}

function currentTabIndex(pathname: string): number {
  const p = stripLocale(pathname);
  if (p.startsWith("/profile") || p.startsWith("/settings")) return 3;
  if (p.startsWith("/buyer")) return 2;
  if (p.startsWith("/auctions")) return 1;
  if (p === "/") return 0;
  return -1;
}

// Touch must START within this many pixels of the left or right edge.
// Edge-swipe is the iOS pattern users already know; mid-page swipes
// stay reserved for HeroCarousel and other inline horizontal scrollers
// so we never fight those gestures.
const EDGE_PX = 36;
// Minimum horizontal travel to commit the navigation.
const COMMIT_DX = 80;
// Reject as horizontal if vertical drift exceeds this — the user is
// probably scrolling or pulling, not navigating.
const MAX_DY = 70;
// Max gesture duration. Keeps slow drags from being read as swipes.
const MAX_DURATION_MS = 700;

/**
 * Edge-swipe navigation between the four main bottom-tab destinations:
 * Home → Auctions → My Bids → Profile.
 *
 *  - Drag from the LEFT edge to the right → previous tab.
 *  - Drag from the RIGHT edge to the left → next tab.
 *
 * Mid-page horizontal motion is ignored, so HeroCarousel swipes,
 * marquees, chip strips, and any future horizontal-scroll component
 * keep working without interference. A thin gold bar peeks from the
 * relevant edge during the gesture so the user has visual confirmation.
 */
export function SideSwipeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [hint, setHint] = useState<{ side: "left" | "right"; px: number } | null>(
    null,
  );

  // Mirror state into refs — see PullToRefresh for the same once-bind
  // pattern. Listeners stay stable for the component lifetime.
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const sideRef = useRef<"left" | "right" | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    log("SideSwipe mounted", { tabs: SWIPE_TABS });

    function reset() {
      startXRef.current = null;
      startYRef.current = null;
      sideRef.current = null;
      setHint(null);
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const w = window.innerWidth;
      let side: "left" | "right" | null = null;
      if (t.clientX <= EDGE_PX) side = "left";
      else if (t.clientX >= w - EDGE_PX) side = "right";
      if (!side) {
        reset();
        return;
      }
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startTimeRef.current = performance.now();
      sideRef.current = side;
    }

    function onTouchMove(e: TouchEvent) {
      if (sideRef.current === null || startXRef.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = Math.abs(t.clientY - (startYRef.current ?? 0));
      // Reject if the user is mostly scrolling vertically.
      if (dy > MAX_DY) {
        reset();
        return;
      }
      // Side-aware travel: left-edge swipe needs +dx, right-edge needs -dx.
      const travel =
        sideRef.current === "left" ? Math.max(0, dx) : Math.max(0, -dx);
      if (travel > 8) {
        setHint({ side: sideRef.current, px: Math.min(travel, COMMIT_DX) });
        // Once we've committed to driving the gesture, suppress the
        // browser's iOS-style edge back-swipe and any text selection.
        if (e.cancelable) e.preventDefault();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (sideRef.current === null || startXRef.current === null) {
        reset();
        return;
      }
      const t = e.changedTouches[0];
      if (!t) {
        reset();
        return;
      }
      const dx = t.clientX - startXRef.current;
      const dy = Math.abs(t.clientY - (startYRef.current ?? 0));
      const dt = performance.now() - startTimeRef.current;
      const travel =
        sideRef.current === "left" ? Math.max(0, dx) : Math.max(0, -dx);
      const commit = travel >= COMMIT_DX && dy < MAX_DY && dt < MAX_DURATION_MS;
      log("touchend", {
        side: sideRef.current,
        travel: Math.round(travel),
        dy: Math.round(dy),
        dt: Math.round(dt),
        commit,
      });
      if (commit) {
        const idx = currentTabIndex(pathRef.current);
        if (idx === -1) {
          // We're not on a known tab page — treat the swipe as "go home".
          router.push("/");
        } else {
          // Left-edge swipe (drag right) → previous tab; right-edge swipe
          // (drag left) → next tab. Wrap clamped, not circular: feels less
          // surprising on a four-tab nav.
          const next =
            sideRef.current === "left"
              ? Math.max(0, idx - 1)
              : Math.min(SWIPE_TABS.length - 1, idx + 1);
          if (next !== idx) {
            log("navigate", { from: SWIPE_TABS[idx], to: SWIPE_TABS[next] });
            try {
              navigator.vibrate?.(8);
            } catch {
              // ignore
            }
            router.push(SWIPE_TABS[next]);
          }
        }
      }
      reset();
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
    // Empty deps — pathname is read via ref; router is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visual hint — thin gold bar peeking from the relevant edge as the
  // user drags. Width grows with travel up to COMMIT_DX, then a final
  // glow at the commit threshold. Pointer-events:none so it can't
  // swallow gestures.
  if (!hint) return null;
  const ready = hint.px >= COMMIT_DX;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 z-[55] flex items-center"
      style={{
        [hint.side]: 0,
      } as React.CSSProperties}
    >
      <div
        className="rounded-full transition-[box-shadow,background] duration-150"
        style={{
          width: 4,
          height: `${Math.min(160, 40 + hint.px)}px`,
          background: ready ? "var(--gold-bright)" : "var(--gold)",
          boxShadow: ready
            ? "0 0 18px var(--gold-glow)"
            : "0 0 8px var(--gold-glow)",
          opacity: Math.min(1, 0.4 + hint.px / COMMIT_DX),
          marginLeft: hint.side === "left" ? 0 : undefined,
          marginRight: hint.side === "right" ? 0 : undefined,
          transform: `translateX(${hint.side === "left" ? hint.px * 0.15 : -hint.px * 0.15}px)`,
        }}
      />
    </div>
  );
}
