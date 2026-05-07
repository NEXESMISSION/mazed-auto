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

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: {
    default: "Mazed Auto — منصة المزادات الذكية للسيارات",
    template: "%s — Mazed Auto",
  },
  description:
    "منصة موثوقة للمزادات على السيارات في تونس — توثيق متعدد الطبقات، مزادات لحظية، شفافية كاملة.",
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
    title: "Mazed Auto — منصة المزادات الذكية للسيارات",
    description:
      "منصة موثوقة للمزادات على السيارات في تونس — توثيق متعدد الطبقات، مزادات لحظية، شفافية كاملة.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mazed Auto",
    description: "منصة موثوقة للمزادات على السيارات في تونس.",
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
  // tag matches the rendered content. Defaults to "ar" when the request did
  // not pass through the i18n middleware (api/auth route handlers).
  const locale = await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
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
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
