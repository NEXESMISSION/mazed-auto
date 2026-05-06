// Mazed Auto service worker — minimal offline shell + push notifications.
// Bumping CACHE_VERSION invalidates the old cache; users get the fresh shell
// on their next visit.

// Bump this version any time you ship UI changes that depend on new JS
// chunks. The activate handler below deletes every cache whose key isn't
// CACHE_VERSION, so users get a fresh load on their next visit.
const CACHE_VERSION = "mazed-v2-redesign";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/logo.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Best-effort precache; ignore individual failures.
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Network-first for navigations (so users always get the latest HTML), with
// the offline page as fallback. For static assets we use cache-first.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Don't intercept Supabase, auth, or anything cross-origin — they need fresh
  // responses + their own auth headers.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }
      })(),
    );
    return;
  }

  // Static asset: cache-first, falling back to network and updating cache.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || new Response("", { status: 504 });
        }
      })(),
    );
  }
});

// Push notifications — payload is { title, body, icon?, url? }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Mazed Auto", body: event.data.text() };
  }
  const options = {
    body: data.body,
    icon: data.icon || "/logo.png",
    badge: "/logo.png",
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "Mazed Auto", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an existing tab if one is open
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
