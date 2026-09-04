import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * `next build` and `next dev` both own `.next` by default, and they overwrite
   * each other's chunk graph. When a production build runs while a dev server
   * is up, the dev server keeps serving from a directory that has been rewritten
   * underneath it: stylesheets 404, and client components resolve a different
   * module instance of next-intl than the provider did, which surfaces as
   * "No intl context found. Have you configured the provider?" on pages whose
   * provider is demonstrably right there in the layout.
   *
   * Set NEXT_DIST_DIR to build somewhere else — e.g. a verification build:
   *   NEXT_DIST_DIR=.next-verify next build
   *   NEXT_DIST_DIR=.next-verify next start -p 3020
   * Unset, everything behaves exactly as before.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Pin Turbopack to this app dir so it doesn't pick up a stray lockfile
  // higher in the tree. `import.meta.dirname` is Node 20+ and survives
  // Next's CJS-output transform of the config file.
  turbopack: {
    root: import.meta.dirname,
  },
  // lucide-react is named-imported across ~125 files. This rewrites those
  // named imports to per-icon deep imports at build time, guaranteeing only
  // the icons actually used are bundled (insurance against the barrel
  // re-export accidentally pulling the whole icon set) and speeding dev
  // compile. Safe, zero-behaviour-change.
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Keep visited pages in the client router cache for a short while.
    //
    // Without this, going BACK to /annonces (force-dynamic) refetches the RSC
    // payload from scratch: the browser tries to restore the scroll position
    // against a page whose content does not exist yet, so it lands at the top
    // and the user loses their place in the catalog every single time.
    // Thirty seconds is enough to cover "open a car, decide, come back" while
    // staying short enough that prices and availability stay fresh.
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    // AVIF first, then WebP. AVIF is ~25–30 % smaller than WebP at the
    // same perceptual quality; next/image negotiates per request based
    // on the browser's Accept header so older browsers transparently
    // fall back to WebP. Our seed sources are WebP — the optimizer
    // decodes and re-encodes to AVIF on demand, caching the result.
    formats: ["image/avif", "image/webp"],
    // Next 16 rejects any next/image `quality` not in this allowlist with a
    // 400 (default permits only 75). The codebase thinks in q≈72 (see the
    // upload presets + the seed-optimization script), so whitelist the values
    // we actually use — otherwise a future `<Image quality={72}>` silently
    // 400s and renders a broken image. 75 stays the default for bare <Image>.
    qualities: [50, 60, 72, 75, 80, 86, 100],
    // Long-cache optimized variants on the CDN. They're keyed by
    // (source URL + width + quality + format) so this is safe.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Property cards render small (≤ ~300px wide); cap the generated variants
    // so the optimizer stops emitting oversized 2048/3840 images for thumbnails
    // (fewer + smaller transforms = faster loads, lower bandwidth).
    deviceSizes: [360, 640, 828, 1080, 1280, 1920],
    imageSizes: [120, 200, 280, 384],
    // Scope to the Supabase Storage public path so the optimizer can only
    // transcode our OWN stored images, not arbitrary URLs on the project host.
    // Dropped the unsplash/picsum hosts (test-only, never rendered): allowing
    // huge public image hosts made /_next/image an anonymous denial-of-wallet —
    // an attacker varies url+width for unlimited cache-miss transcodes billed
    // to us. (Realtime/edge rate-limiting of /_next/image is a separate WAF
    // task; this removes the unbounded-distinct-source amplifier.)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
    /**
     * Next refuses to fetch an upstream image whose hostname resolves to a
     * private IP (SSRF protection), and it resolves with family:0 + ALL — so it
     * sees AAAA records too. On a network that runs DNS64, supabase.co comes
     * back as NAT64 addresses (64:ff9b::6812:260a — the well-known RFC 6052
     * prefix with 104.18.38.10 embedded). Next classifies 64:ff9b::/96 as
     * private, so EVERY remote image 400s with `"url" parameter is not allowed`
     * and the whole site renders imageless. It is not a config or data problem:
     * the URLs match remotePatterns and the objects return 200.
     *
     * Development only. In production the guard stays fully armed — Vercel does
     * not do DNS64, and this is the flag that stops /_next/image being pointed
     * at a metadata endpoint.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
    const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "";

    const csp = [
      "default-src 'self'",
      // va.vercel-scripts.com serves the Vercel Web Analytics + Speed Insights
      // scripts in dev/preview (prod proxies them same-origin via /_vercel). Add
      // it so the analytics you ship (@vercel/analytics + speed-insights) aren't
      // CSP-blocked and actually collect data.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.tile.openstreetmap.org https://picsum.photos https://fastly.picsum.photos",
      "font-src 'self' data: https://fonts.gstatic.com",
      [
        "connect-src 'self'",
        supabaseUrl,
        supabaseWs,
        "https://api.konnect.network",
        "https://api.paymee.tn",
        "https://*.flouci.com",
        // Vercel Analytics / Speed Insights beacons (dev/preview hosts; prod is
        // same-origin via /_vercel/insights).
        "https://va.vercel-scripts.com",
        "https://vitals.vercel-insights.com",
      ]
        .filter(Boolean)
        .join(" "),
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      // Embedded property-location maps come from openstreetmap.org's
      // /export/embed.html viewer (we don't bundle Leaflet ourselves).
      // Supabase storage signed URLs are also framed: the in-app
      // document viewer (titre foncier etc.) embeds them via iframe so
      // PDFs/images open inside the page instead of in a new tab. The
      // URLs are short-lived (60 s TTL) and RLS-gated, so allowing the
      // origin in frame-src doesn't widen the attack surface.
      "frame-src 'self' https://www.openstreetmap.org https://*.supabase.co",
      // PWA: allow the service worker, the manifest, and child workers.
      // `blob:` is required by heic2any, which converts iPhone HEIC receipts
      // in a Web Worker spawned from a blob URL — without it the worker is
      // blocked and the receipt upload hangs forever on "Envoi".
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self), payment=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      // Service worker must not be cached aggressively, and needs the
      // Service-Worker-Allowed header to claim the full origin scope.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      // Seed property images — content-addressable (re-encoded only
      // when the optimization script runs), safe to long-cache.
      // immutable lets the browser skip even the conditional GET on
      // the second visit.
      {
        source: "/properties/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
