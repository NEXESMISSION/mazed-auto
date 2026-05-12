"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

const TAG = "[Swipe]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
   
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}

// Order matters — left-to-right is the swipe sequence. Center "Sell"
// tab skipped on purpose (it kicks off a multi-step flow).
const SWIPE_TABS = ["/", "/auctions", "/buyer/bids", "/profile"];

// The id we expect on the AppShell's <main> wrapper. The whole page
// content is translated via style.transform on this element so the
// finger drags the page itself, not just an indicator.
const PAGE_EL_ID = "app-main";

// Minimum horizontal travel to commit the navigation.
const COMMIT_DX = 90;
// Vertical drift > this aborts the gesture (user is scrolling, not swiping).
const MAX_DY = 60;
// We need at least this many pixels of horizontal motion before we
// commit to driving the page — below this, normal taps and tiny finger
// jitter pass through to the underlying buttons.
const ACTIVATION_DX = 14;
// Hard cap on how far the page can drag, so it never goes fully
// off-screen during the gesture (prevents the "finger lost" feel).
function maxDrag(): number {
  return Math.min(window.innerWidth, 480) * 0.7;
}

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

/**
 * Walk up the DOM from the touch target and look for any ancestor
 * that's a horizontal scroller, has its own swipe behaviour, or is
 * explicitly marked `data-swipe-skip`. If we find one, the swipe
 * belongs to that element (carousel, marquee, chip strip, tabs, etc.)
 * and we don't intercept.
 */
function shouldSkip(target: EventTarget | null): boolean {
  let el = target as Element | null;
  while (el && el !== document.body) {
    const dataset = (el as HTMLElement).dataset;
    if (dataset?.swipeSkip !== undefined) return true;
    const cls = (el as HTMLElement).className;
    if (typeof cls === "string") {
      // The marquees + AutoPagingScroller use these class names — they
      // already own their own touch behaviour, so let them.
      if (cls.includes("marquee-track")) return true;
      if (cls.includes("auto-paging-scroller")) return true;
    }
    const style = window.getComputedStyle(el);
    const ox = style.overflowX;
    if (
      (ox === "auto" || ox === "scroll") &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Full-page horizontal swipe between the four main bottom-tab
 * destinations: Home → Auctions → My Bids → Profile.
 *
 * - Drag right → previous tab.
 * - Drag left  → next tab.
 *
 * The page content (the `#app-main` element) translates 1:1 with the
 * finger during the drag, then either snaps out and navigates on
 * commit, or springs back on cancel. Inline horizontal scrollers
 * (HeroCarousel, marquees, chip strips, scrollable tabs) are
 * detected automatically and skip the gesture.
 */
export function SideSwipeNav() {
  const router = useRouter();
  const pathname = usePathname();

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const armedRef = useRef(false);
  const draggingRef = useRef(false);
  const lastDxRef = useRef(0);
  const pathRef = useRef(pathname);
  // eslint-disable-next-line react-hooks/refs
  pathRef.current = pathname;

  // Reset the page transform when the route changes — otherwise the
  // new page would render with the leftover translate from the swipe.
  useEffect(() => {
    const el = document.getElementById(PAGE_EL_ID);
    if (!el) return;
    el.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.transform = "translateX(0)";
    // Strip the inline transition once it's done so subsequent gesture
    // updates don't fight a leftover one.
    const t = setTimeout(() => {
      el.style.transition = "";
    }, 240);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    log("SideSwipe mounted", { tabs: SWIPE_TABS });

    function getMain() {
      return document.getElementById(PAGE_EL_ID);
    }

    function setMainTransform(px: number) {
      const el = getMain();
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = `translate3d(${px}px, 0, 0)`;
    }

    function springBackMain() {
      const el = getMain();
      if (!el) return;
      el.style.transition = "transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)";
      el.style.transform = "translate3d(0, 0, 0)";
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 280);
    }

    function snapOutAndNavigate(direction: "left" | "right") {
      const el = getMain();
      const idx = currentTabIndex(pathRef.current);
      if (idx === -1 || !el) {
        if (el) springBackMain();
        return;
      }
      const next =
        direction === "right"
          ? Math.max(0, idx - 1) // drag-right → previous
          : Math.min(SWIPE_TABS.length - 1, idx + 1); // drag-left → next
      if (next === idx) {
        // We're at the end of the sequence — bounce back instead of
        // sliding into nothing.
        springBackMain();
        return;
      }
      const w = window.innerWidth;
      el.style.transition = "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.transform = `translate3d(${direction === "right" ? w : -w}px, 0, 0)`;
      // Haptic was here. Chrome blocks navigator.vibrate() until the iframe
      // has been activated, even after a touch, which logs an intervention
      // warning on every swipe in dev. Skipped — iOS doesn't honour it
      // anyway and Android Chrome users get the visual slide already.
      log("navigate", {
        from: SWIPE_TABS[idx],
        to: SWIPE_TABS[next],
        direction,
      });
      // Push slightly before the slide finishes so the new page is
      // already mounted by the time the route effect resets transform.
      setTimeout(() => router.push(SWIPE_TABS[next]), 120);
    }

    function reset(silent = false) {
      armedRef.current = false;
      draggingRef.current = false;
      startXRef.current = null;
      startYRef.current = null;
      lastDxRef.current = 0;
      if (!silent) {
        const el = getMain();
        if (el && el.style.transform && el.style.transform !== "translate3d(0px, 0px, 0px)") {
          springBackMain();
        }
      }
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      // Don't start if this gesture is inside a scrollable strip,
      // marquee, carousel, or any element marked data-swipe-skip.
      if (shouldSkip(e.target)) {
        startXRef.current = null;
        return;
      }
      // Only run on tab pages — on auction detail / KYC / etc., there's
      // no "next tab" to navigate to; stay out of the way.
      if (currentTabIndex(pathRef.current) === -1) {
        startXRef.current = null;
        return;
      }
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startTimeRef.current = performance.now();
      armedRef.current = true;
      draggingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (!armedRef.current || startXRef.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = Math.abs(t.clientY - (startYRef.current ?? 0));

      // Vertical drift kills the gesture — user is scrolling/pulling.
      if (dy > MAX_DY && Math.abs(dx) < dy * 1.2) {
        log("touchmove ABORT — vertical");
        if (draggingRef.current) springBackMain();
        reset(true);
        return;
      }

      // Wait for clear horizontal intent before stealing the gesture.
      if (!draggingRef.current && Math.abs(dx) < ACTIVATION_DX) {
        return;
      }

      draggingRef.current = true;
      const cap = maxDrag();
      const clamped = Math.max(-cap, Math.min(cap, dx));
      lastDxRef.current = clamped;
      setMainTransform(clamped);
      // We own the gesture now — stop the document from also scrolling
      // horizontally / firing native swipe-back.
      if (e.cancelable) e.preventDefault();
    }

    function onTouchEnd(e: TouchEvent) {
      if (!armedRef.current) {
        reset(true);
        return;
      }
      armedRef.current = false;
      if (!draggingRef.current) {
        reset(true);
        return;
      }
      const dx = lastDxRef.current;
      const dt = performance.now() - startTimeRef.current;
      const commit = Math.abs(dx) >= COMMIT_DX && dt < 800;
      log("touchend", {
        dx: Math.round(dx),
        dt: Math.round(dt),
        commit,
        target: (e.target as Element)?.tagName,
      });
      if (commit) {
        snapOutAndNavigate(dx > 0 ? "right" : "left");
      } else {
        springBackMain();
      }
      draggingRef.current = false;
      startXRef.current = null;
      startYRef.current = null;
      lastDxRef.current = 0;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
