"use client";

import { useEffect } from "react";

/**
 * Tells the server this storefront was actually looked at — the shop's
 * « vues de la boutique » (0193). Same rules as an annonce's ViewTracker: once
 * the page has been on screen for a moment, never from a prefetch, and the
 * database keeps one row per visitor per day whatever this sends.
 */
export function ShopViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `sv:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* storage unavailable — the database de-duplicates */
    }
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* storage unavailable */
      }
      void fetch(`/api/boutiques/${slug}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "shop_view" }),
        keepalive: true,
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [slug]);

  return null;
}
