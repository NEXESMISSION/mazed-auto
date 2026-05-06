"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker in production and — critically — actively
 * UNREGISTERS any leftover service worker in development. Without the dev
 * cleanup, a SW installed once on this origin (from a `next start` run, or
 * from visiting the deployed site) keeps serving stale JS chunks on dev,
 * which mixes old and new code on screen. The explicit unregister here means
 * a fresh `pnpm dev` always paints from network, no matter what was cached
 * before.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev: tear down any previously installed SW + caches so we always
      // serve fresh code while iterating.
      (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch (err) {
          console.warn("SW dev cleanup failed:", err);
        }
      })();
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          console.warn("SW registration failed:", err);
        });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
