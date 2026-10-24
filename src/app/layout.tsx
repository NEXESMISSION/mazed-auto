import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PWARegister } from "@/components/layout/PWARegister";
import { Suspense } from "react";
import { ClientLogger } from "@/components/dev/ClientLogger";
import { ClientErrorReporter } from "@/components/observability/ClientErrorReporter";
import { OG_IMAGE } from "@/lib/ogImage";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Plus Jakarta Sans — SELF-HOSTED (next/font/local) instead of next/font/google.
// Two wins: (1) the build no longer fetches the font from Google at build time,
// which was the cause of intermittent `next build` failures on flaky networks;
// (2) zero render-blocking round-trip to fonts.gstatic.com at runtime → faster
// first paint. One latin-subset variable woff2 (~27 KB) covers weights 400–800
// (the only range the UI uses); latin already covers all French accents.
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  variable: "--font-jakarta",
  weight: "400 800",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  applicationName: "Mazed Auto",
  title: {
    default: "Mazed Auto — Petites annonces automobiles en Tunisie",
    template: "%s · Mazed Auto",
  },
  description:
    "Voitures et pièces de rechange partout en Tunisie. Le prix est affiché, "
    + "vous appelez le vendeur — chaque annonce est vérifiée avant sa mise en ligne.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mazed Auto",
    statusBarStyle: "default",
    startupImage: ["/brand/icon-512.png"],
  },
  // Browser-tab + apple-touch icons are provided by the file-based metadata
  // convention (src/app/icon.png, apple-icon.png, favicon.ico), including the
  // /favicon.ico path browsers request by default. They and everything in
  // public/brand/ are generated from one source by scripts/regen-logos.mjs.
  openGraph: {
    title: "Mazed Auto — Petites annonces automobiles en Tunisie",
    description:
      "Voitures et pièces de rechange partout en Tunisie. Le prix est affiché, "
      + "vous appelez le vendeur.",
    type: "website",
    siteName: "Mazed Auto",
    images: [OG_IMAGE],
  },
  twitter: {
    // The preview is 1200x630; a plain "summary" card crops it to a square.
    card: "summary_large_image",
    title: "Mazed Auto — Petites annonces automobiles en Tunisie",
    description:
      "Voitures et pièces de rechange partout en Tunisie. Le prix est affiché, "
      + "vous appelez le vendeur.",
    images: [OG_IMAGE.url],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Origin of the Supabase project so the browser can warm a TLS +
  // HTTP/2 connection before we issue the first auth/db/storage call.
  // Skipped when unset (dev with `.env.example` only).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl
    ? (() => { try { return new URL(supabaseUrl).origin; } catch { return null; } })()
    : null;

  return (
    <html
      lang="fr"
      dir="ltr"
      // Tells Next.js this `scroll-behavior: smooth` is intentional and
      // shouldn't be disabled during route transitions.
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} h-full antialiased`}
      // Inline bg paints with the first HTML byte, before globals.css
      // resolves — keeps the initial paint on-brand.
      style={{ background: "#0a0a0a" }}
    >
      <head>
        {/*
          Warm TCP + TLS + HTTP/2 connections to origins we hit early
          on every page so the first auth/db/storage call saves the
          ~100–250 ms cold-handshake. preconnect is the strong form
          (full handshake); dns-prefetch is the cheap fallback for
          browsers that ignore preconnect (mostly older WebKit).
        */}
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        {/* OpenStreetMap tile servers — only hit on property-detail
            pages, but pre-warming costs ~0 and shaves perceived load
            time on the map iframe. */}
        <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
        {/* No logo preload here. There used to be one for the splash
            screen, but SplashScreen is not mounted anywhere, so every page
            fetched a logo file nothing displayed. The bar logos are
            next/image `priority`, which emits its own preload. */}
      </head>
      <body
        className="min-h-full bg-background text-foreground font-sans"
        style={{ background: "#0a0a0a" }}
      >
        {/* Skip link — first focusable element; lets keyboard/screen-reader
            users jump past the nav straight to the page content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-[var(--gold)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
        >
          Aller au contenu
        </a>
        {children}
        <PWARegister />
        {/* Ships uncaught client errors + unhandled rejections to the server
            log sink — pairs with instrumentation.ts (server errors) for a
            single, unified observability stream. */}
        <ClientErrorReporter />
        {/* Vercel web analytics + Core Web Vitals (zero-config, no DSN).
            Real-user performance + traffic without a third-party tag. */}
        <Analytics />
        <SpeedInsights />
        <Suspense fallback={null}>
          <ClientLogger />
        </Suspense>
      </body>
    </html>
  );
}
