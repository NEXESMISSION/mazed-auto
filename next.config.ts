import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin Turbopack to this app dir so it doesn't pick up a stray lockfile
  // higher in the tree (e.g. a system-wide ~/package-lock.json).
  turbopack: {
    root: import.meta.dirname,
  },

  // Allow remote car images served from Supabase Storage and Unsplash (seed data).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  async headers() {
    // ─── Security headers policy ────────────────────────────────────────
    //
    // HSTS — tell browsers to upgrade plain-HTTP requests to HTTPS for
    // the next 2 years and lock subdomains in. `preload` makes us
    // eligible for the browser-baked preload list. Only meaningful on
    // production (Vercel terminates TLS); shipping in non-prod is fine
    // because browsers ignore HSTS on http://localhost.
    //
    // Permissions-Policy — declare the powerful APIs we DO use (camera
    // for KYC liveness + plate capture) and shut everything else off so
    // a future XSS can't enable a microphone or read clipboard.
    //
    // Content-Security-Policy — the big one. The current site needs:
    //   - script-src 'self' + inline scripts for next-intl hydration
    //     (next-intl's RSC payload includes inlined JSON in <script>);
    //     'unsafe-inline' is needed because Next.js itself injects
    //     inline scripts for streaming. Tightening this further would
    //     require nonces, which Next.js 16 doesn't expose cleanly yet.
    //   - connect-src — Supabase project URL (REST + realtime ws + storage)
    //     + Sentry ingest + Konnect API. Built dynamically below from
    //     the env so it stays in sync with the active project.
    //   - img-src — supabase storage + unsplash + data: (for the
    //     image-decoder polyfill in image compress). blob: needed for
    //     uploaded preview thumbnails.
    //   - frame-ancestors 'none' duplicates X-Frame-Options but covers
    //     browsers that ignore the legacy header.
    //
    // We DON'T set CSP report-only — direct enforcement, since the
    // ruleset is permissive enough that legitimate flows shouldn't trip
    // it.

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
    const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "";

    const csp = [
      "default-src 'self'",
      // Next.js + next-intl require inline + eval for streaming SSR
      // payloads. We accept the slightly-wider script policy in exchange
      // for not needing per-request nonces. Sentry's loader is bundled,
      // not a remote script.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Allow images from our supabase project (transform endpoint), our
      // own domain, unsplash seed photos, data: URIs for inline SVG
      // backgrounds, and blob: for client-side image preview before upload.
      `img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com`,
      "font-src 'self' data:",
      // REST + realtime websocket + storage + Sentry ingest + Konnect.
      // Konnect's API host varies; using the production domain only —
      // staging deploys can append their own host via a Vercel env.
      [
        "connect-src 'self'",
        supabaseUrl,
        supabaseWs,
        "https://api.konnect.network",
        "https://*.sentry.io",
        "https://*.ingest.sentry.io",
      ]
        .filter(Boolean)
        .join(" "),
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    const permissionsPolicy = [
      "camera=(self)",
      "microphone=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", ");

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
          { key: "Permissions-Policy", value: permissionsPolicy },
          { key: "Content-Security-Policy", value: csp },
          // Disable cross-origin loading of this document by default.
          // Pages that embed third-party content (none today) would
          // override per-route.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Service worker must always be revalidated so updates land fast.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Splash + brand assets are content-stable; let browsers (and
        // intermediaries) cache them for a year. Pair with the SW
        // precache so installed PWAs paint the splash from cache too.
        source: "/(loading.jpg|logo.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// Sentry wrapper. Only does anything when SENTRY_AUTH_TOKEN + project/org are
// set in Vercel — otherwise it's a no-op so local builds still work. The
// next-intl plugin must wrap the inner config so its loader runs first.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT || "mazed-auto-web",
  silent: !process.env.CI,
  // Source maps are uploaded but kept off the public bundle so stack traces
  // resolve in Sentry without leaking source to the browser.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
});

