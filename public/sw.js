// Mazed Auto service worker — minimal offline shell + push notifications.
// Bumping CACHE_VERSION invalidates the old cache; users get the fresh shell
// on their next visit.

// Bump this version any time you ship UI changes that depend on new JS
// chunks. The activate handler below deletes every cache whose key isn't
// CACHE_VERSION (or IMAGE_CACHE), so users get a fresh load on their next visit.
// v5: cache cross-origin Supabase image transforms with stale-while-revalidate
// so the PWA stops re-downloading the same auction photos on every cold launch.
const CACHE_VERSION = "mazed-v5-img-swr";
const IMAGE_CACHE = "mazed-img-v1"; // separate name so we don't nuke images
                                     // when CACHE_VERSION rolls forward on
                                     // every JS chunk bump.
const IMAGE_CACHE_LIMIT = 250;      // ~250 thumbnails ≈ 5–10 MB on disk.
const OFFLINE_URL = "/offline";
// /loading.webp is the branded splash (22 KB, was 69 KB JPG). JPG kept
// as a <picture> fallback for ancient browsers. Precaching means
// subsequent loads — including the installed PWA on cold start —
// paint the splash from cache without a network round-trip.
const PRECACHE = [
  OFFLINE_URL,
  "/logo.png",
  "/loading.webp",
  "/loading.jpg",
  "/manifest.webmanifest",
];

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
      // Keep IMAGE_CACHE across version bumps — those entries are
      // idempotent (URL = key includes width/quality params) so there's
      // no point re-downloading them when CACHE_VERSION rolls. We only
      // delete shell caches whose key isn't the current version.
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== IMAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Returns true if the URL is a Supabase Storage image transform URL
 * (the only cross-origin assets we want to cache). Keeps the SW out of
 * auth, realtime, and any other Supabase API surface that needs fresh
 * responses + cookies.
 */
function isSupabaseImage(url) {
  if (!url.hostname.endsWith(".supabase.co")) return false;
  return (
    url.pathname.startsWith("/storage/v1/render/image/") ||
    url.pathname.startsWith("/storage/v1/object/public/")
  );
}

/**
 * Trim the image cache to IMAGE_CACHE_LIMIT entries, evicting the
 * oldest (FIFO via insertion order). Runs after every successful put
 * — cheap because cache.keys() is just a list of Request handles.
 */
async function trimImageCache() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= IMAGE_CACHE_LIMIT) return;
  const overflow = keys.length - IMAGE_CACHE_LIMIT;
  for (let i = 0; i < overflow; i++) {
    // FIFO: cache.keys() returns insertion order so [0] is oldest.
    await cache.delete(keys[i]);
  }
}

// Network-first for navigations (so users always get the latest HTML), with
// the offline page as fallback. For static assets we use cache-first. For
// Supabase image transforms we use stale-while-revalidate.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ─── Cross-origin: Supabase image transforms get cached ──────────────
  // Everything else cross-origin (auth, realtime, RPC, OAuth providers)
  // needs to pass through untouched — those carry user cookies / tokens
  // and would break under any caching layer.
  if (url.origin !== self.location.origin) {
    if (isSupabaseImage(url)) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(IMAGE_CACHE);
          const hit = await cache.match(req);

          // Always kick off a background refresh so the cached copy
          // doesn't go stale forever (auction photos can be replaced
          // by sellers; brand logos can be updated by admins). We
          // don't await this — the user gets the cached pixel first.
          const refresh = fetch(req)
            .then((res) => {
              if (res && res.ok) {
                // Clone before storing — the Response body is a stream
                // that can only be consumed once. Best-effort; ignore
                // quota errors.
                cache.put(req, res.clone()).then(trimImageCache).catch(() => {});
              }
              return res;
            })
            .catch(() => null);

          // Cache hit: serve instantly, swr in the background.
          if (hit) return hit;

          // Cold cache: wait for the network, return whatever it gives.
          const res = await refresh;
          return (
            res ||
            new Response("", { status: 504, statusText: "Image fetch failed" })
          );
        })(),
      );
    }
    return; // Other cross-origin requests pass through untouched.
  }

  // ─── Same-origin paths we shouldn't intercept ────────────────────────
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
