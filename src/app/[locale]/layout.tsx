import { Suspense } from "react";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { localeDirection, ogLocale, routing } from "@/i18n/routing";
import { clientMessages } from "@/i18n/areas";
import { MobileShell } from "@/components/layout/MobileShell";
import { NetworkStatus } from "@/components/layout/NetworkStatus";
import { PWARegister } from "@/components/layout/PWARegister";
import { ToastProvider } from "@/components/ui/Toast";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { PopupManagerLazy } from "@/components/popups/PopupManagerLazy";
import { WatchlistSync } from "@/components/watchlist/WatchlistSync";
import { ClientLogger } from "@/components/dev/ClientLogger";
import { ClientErrorReporter } from "@/components/observability/ClientErrorReporter";
import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/ogImage";

// Plus Jakarta Sans — SELF-HOSTED (next/font/local) instead of next/font/google.
// Two wins: (1) the build no longer fetches the font from Google at build time,
// which was the cause of intermittent `next build` failures on flaky networks;
// (2) zero render-blocking round-trip to fonts.gstatic.com at runtime → faster
// first paint. One latin-subset variable woff2 (~27 KB) covers weights 400–800
// (the only range the UI uses); latin already covers all French accents.
const jakarta = localFont({
  src: "../fonts/PlusJakartaSans-latin.woff2",
  variable: "--font-jakarta",
  weight: "400 800",
  display: "swap",
});

// Cairo for Arabic — self-hosted the same way: the Arabic subset of the
// variable font (~31 KB, OFL, from @fontsource-variable/cairo). Geometric like
// Jakarta, and it sits AFTER Jakarta in every font stack (globals.css): Latin
// letters and digits keep the site's font, Arabic letters fall through to this
// one. The unicode-range means a page with no Arabic on it never downloads it,
// and it is not preloaded for the same reason.
const cairo = localFont({
  src: "../fonts/Cairo-arabic.woff2",
  variable: "--font-cairo",
  weight: "200 1000",
  display: "swap",
  preload: false,
  declarations: [
    {
      prop: "unicode-range",
      // One literal: next/font reads its options at build time, not as code.
      value: "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC",
    },
  ],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "brand" });
  const title = `${t("name")} — ${t("domain")}`;
  return {
    title: { default: title, template: `%s · ${t("domain")}` },
    description: t("tagline"),
    openGraph: {
      title,
      description: t("tagline"),
      type: "website",
      siteName: t("domain"),
      locale: ogLocale(locale),
      alternateLocale: routing.locales.filter((l) => l !== locale).map(ogLocale),
      // Restated, not inherited: this object replaces the root layout's.
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t("tagline"),
      images: [OG_IMAGE.url],
    },
    // No `alternates` here: a layout's would be inherited by every page under
    // it, each claiming the home page as its other-language version. Pages that
    // are worth indexing set their own (see src/i18n/alternates.ts), and the
    // middleware sends hreflang Link headers for every page besides.
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Enable static rendering for pages under this layout that opt in (e.g. the
  // home page's `revalidate`). Without this, next-intl reads request headers
  // and forces every route dynamic. Must run before getMessages/getTranslations.
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations("shell");

  // Origin of the Supabase project so the browser can warm a TLS +
  // HTTP/2 connection before we issue the first auth/db/storage call.
  // Skipped when unset (dev with `.env.example` only).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl
    ? (() => { try { return new URL(supabaseUrl).origin; } catch { return null; } })()
    : null;

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      // Tells Next.js this `scroll-behavior: smooth` is intentional and
      // shouldn't be disabled during route transitions.
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} ${cairo.variable} h-full antialiased`}
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
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-[var(--gold)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
        >
          {t("skipToContent")}
        </a>
        {/* The core and the global areas only — a route that needs more wraps
            its pages in <AreaMessages> (see src/i18n/areas.ts). */}
        <NextIntlClientProvider locale={locale} messages={clientMessages(messages)}>
          <ToastProvider>
            {/* Fires on the click, before the server has answered. See the
                component: every page here is force-dynamic, so a navigation is a
                full round trip that used to happen with nothing on screen moving. */}
            <NavigationProgress />
            <NetworkStatus />
            <WatchlistSync />
            <MobileShell>{children}</MobileShell>
            {/* Site-wide admin-managed popup surface. Lazy-loaded (ssr:false)
                so its JS + /api/popups/match fetch stay off the critical path.
                Self-skips admin routes so previews don't compete with live
                broadcasts. See PopupManager.tsx for the lifecycle. */}
            <PopupManagerLazy />
          </ToastProvider>
        </NextIntlClientProvider>
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
