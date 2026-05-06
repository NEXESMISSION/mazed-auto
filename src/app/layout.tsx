import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  // Latin only now — the app shipped in French. Keeping the Cairo family
  // so Tunisian buyers used to the previous look still recognize it.
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      className={`${cairo.variable} h-full antialiased`}
    >
      <head>
        {/* Preload the splash logo so it paints with the very first frame
            instead of waiting for the SplashScreen component's <img> to
            request it. Tiny (~138 KB) so the cost is negligible. */}
        <link rel="preload" as="image" href="/logo.png" fetchPriority="high" />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <SplashScreen />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
