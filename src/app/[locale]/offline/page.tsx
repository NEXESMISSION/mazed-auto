import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { LOGO } from "@/lib/brand";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.offline" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

// Static: prerendered at build for each locale (generateStaticParams in the
// [locale] layout) and served from the edge CDN, because nothing here reads a
// request. NOT `dynamic = "force-static"`: under it next-intl lost the locale
// that setRequestLocale sets, and /ar rendered this page — and the site's bars
// around it — in French. It must stay static: the service worker precaches
// /fr/offline as a stable document and serves it when a navigation fails
// offline (see public/sw.js).

/**
 * Branded offline fallback. Deliberately self-contained: the logo is the one
 * file the service worker precaches next to this page, the copy is plain
 * text, and "Réessayer" is an <a href=""> — the empty href re-navigates to
 * the *current* URL (the page the user actually wanted, since the SW serves
 * this document in its place), and it works even if the JS bundles aren't
 * cached.
 */
export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  // Static page: next-intl must be told the locale, it cannot read a header.
  setRequestLocale(locale);
  const t = await getTranslations("info.offline");
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col items-center justify-center px-6 py-14 text-center">
      {/* `unoptimized` so the URL is exactly the one sw.js precaches — an
          optimizer URL (/_next/image?…) would not be in the cache offline. */}
      <Image
        src={LOGO.lockupWebp.src}
        alt="Mazed Auto"
        width={LOGO.lockupWebp.width}
        height={LOGO.lockupWebp.height}
        unoptimized
        className="h-32 w-auto"
      />

      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-gold ring-1 ring-gold/30">
        <WifiOff className="size-3.5" strokeWidth={2.4} />
        {t("badge")}
      </span>

      <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-foreground">
        {t("title")}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        {t("body")}
      </p>

      <a
        href=""
        className="batta-btn-luxe mt-6 h-11 w-full max-w-60 rounded-full px-6 text-[13px]"
      >
        {t("retry")}
      </a>
      {/* Intentional plain <a>: on a SW-served fallback document the Next
          client router is detached from the real route, so a hard
          navigation (intercepted by the service worker) is what we want. */}
      <a
        href={`/${locale}`}
        className="mt-3 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        {t("home")}
      </a>
    </main>
  );
}
