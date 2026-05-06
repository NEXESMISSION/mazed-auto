import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
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

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: {
    default: "Mazed Auto — La plateforme intelligente d'enchères automobiles",
    template: "%s — Mazed Auto",
  },
  description:
    "Plateforme d'enchères automobiles de confiance en Tunisie — vérification multi-couches, enchères en temps réel, transparence totale.",
  applicationName: "Mazed Auto",
  appleWebApp: {
    capable: true,
    title: "Mazed Auto",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Mazed Auto",
    title: "Mazed Auto — La plateforme intelligente d'enchères automobiles",
    description:
      "Plateforme d'enchères automobiles de confiance en Tunisie — vérification multi-couches, enchères en temps réel, transparence totale.",
    locale: "fr_TN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mazed Auto",
    description:
      "Plateforme d'enchères automobiles de confiance en Tunisie.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      dir="ltr"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <head>
        {/* Preload the splash image at the highest priority so it paints
            with the very first frame. The black splash container is
            painted instantly via inline CSS regardless — this just gets
            the image visible faster. */}
        <link rel="preload" as="image" href="/loading.png" fetchPriority="high" />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        {/* SplashScreen FIRST — server-rendered so it paints with the very
            first HTML byte, BEFORE any per-route loading skeleton. Plays
            on every refresh / fresh entry (no session gate). */}
        <SplashScreen />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
