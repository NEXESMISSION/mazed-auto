import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getLocale } from "next-intl/server";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

// Plus Jakarta Sans — modern, clean, slightly elegant geometric sans.
// Pairs well with the dark + gold palette and reads great at every size.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

// Locale-agnostic metadata only. The localized title/description/OG live
// in app/[locale]/layout.tsx#generateMetadata so /fr/* serves French copy
// in the <title>, OG cards, and meta description, and /ar/* serves Arabic.
export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  applicationName: "Mazed Auto",
  appleWebApp: {
    capable: true,
    title: "Mazed Auto",
    statusBarStyle: "black-translucent",
    // Single fallback startup image so the iOS PWA launch screen isn't
    // a white flash. Will stretch/crop on any device whose viewport
    // doesn't match the source aspect; for proper per-device assets
    // run pwa-asset-generator (see scripts/pwa-splash.md) and replace
    // this with the full media-query array.
    startupImage: ["/loading.jpg"],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the active locale via the next-intl request context so the html
  // tag matches the rendered content. Falls back to the routing default
  // ("fr") when the request did not pass through the i18n middleware
  // (api/auth route handlers don't run it).
  const locale = await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${jakarta.variable} h-full antialiased`}
      // Inline bg kills the white FOUC flash — paints with the very first
      // HTML byte, before globals.css needs to resolve.
      style={{ background: "#0a0a0a" }}
    >
      <head>
        {/* Preload the splash image at the highest priority so it paints
            with the very first frame. The inlined LQIP in SplashScreen
            paints with the HTML itself; this preload gets the full
            22 KB WebP arriving before the splash even mounts. JPG
            fallback for ancient browsers is announced via <picture>
            in SplashScreen so we only preload the WebP here. */}
        <link
          rel="preload"
          as="image"
          href="/loading.webp"
          type="image/webp"
          fetchPriority="high"
        />
        {/* Preconnect to the Supabase origin so the first image / RPC
            call doesn't eat ~200-400ms on DNS + TLS. Every page hits
            this host (auth, image transforms, realtime). */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
            <link
              rel="dns-prefetch"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            />
          </>
        )}
      </head>
      <body
        className="min-h-full bg-background text-foreground font-sans"
        style={{ background: "#0a0a0a" }}
      >
        {/* SplashScreen FIRST — server-rendered so it paints with the very
            first HTML byte, BEFORE any per-route loading skeleton. Plays
            on every refresh / fresh entry (no session gate). */}
        <SplashScreen />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
