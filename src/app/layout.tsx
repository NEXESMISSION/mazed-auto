import type { Metadata, Viewport } from "next";
import { OG_IMAGE } from "@/lib/ogImage";
import { LOGO } from "@/lib/brand";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

// The French defaults. Every page under [locale] restates title, description
// and OpenGraph in its own language (see [locale]/layout.tsx); these stay for
// the few files outside it.
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
    startupImage: [LOGO.icon512.src],
  },
  // Browser-tab + apple-touch icons are provided by the file-based metadata
  // convention (src/app/icon.png, apple-icon.png, favicon.ico), including the
  // /favicon.ico path browsers request by default. They and everything in
  // public/brand/<version>/ are generated from one source by
  // scripts/regen-logos.mjs, which also writes the paths into src/lib/brand.ts.
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

/**
 * A pass-through. <html> is rendered by [locale]/layout.tsx, the first place
 * that knows the language, so `lang` and `dir` are right in the HTML the
 * server sends — for crawlers, screen readers, and the first paint of an
 * Arabic page, which must not flash left-to-right. The 404 for URLs outside
 * any locale (src/app/not-found.tsx) renders its own.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
