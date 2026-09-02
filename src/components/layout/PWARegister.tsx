"use client";

import { useEffect } from "react";

// Registers the service worker once on mount. Only runs in production
// to avoid stale caches getting in the way of dev hot-reload.
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Dev self-heal: a service worker left over from a prior production /
      // preview build stays active and keeps serving its stale cache (old
      // white shell + land logo) even after code changes. Kill any active SW
      // and wipe its caches so the dev server is always served fresh.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    // A new worker calls skipWaiting() on install and claim() on activate, so
    // it takes over as soon as it exists. Without the reload below, though,
    // the page you are LOOKING at was already rendered from the old cache —
    // which is why a returning user reports "nothing changed" after a deploy.
    // Reload once, and only once, when control actually changes hands.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Ask immediately rather than waiting for the browser's own 24h
          // check — an installed PWA can otherwise sit a full day behind.
          reg.update().catch(() => {});
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        })
        .catch(() => {
          // Swallow — SW failure must never block the app shell.
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
