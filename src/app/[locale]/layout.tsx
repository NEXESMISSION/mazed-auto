import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ToastProvider } from "@/components/ui/Toast";
import { OfflineOverlay } from "@/components/pwa/OfflineOverlay";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { AuthProvider } from "@/lib/auth-provider";
import { mapUser } from "@/lib/auth-shared";
import { createClient } from "@/lib/supabase/server";

// Pre-render both locales at build so navigations between them feel instant.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Locale-aware <title>/description/OG. Without this, the root layout's
// fallback metadata would render the same copy on every route — meaning
// /fr/* showed Arabic in the browser tab and on social-share previews.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: { default: t("titleDefault"), template: t("titleTemplate") },
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: "Mazed Auto",
      title: t("titleDefault"),
      description: t("description"),
      locale: locale === "ar" ? "ar_TN" : "fr_TN",
    },
    twitter: {
      card: "summary_large_image",
      title: "Mazed Auto",
      description: t("descriptionShort"),
    },
  };
}

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required so server components rendered statically still see the locale.
  setRequestLocale(locale);

  // Resolve the user server-side so client components below get the
  // real value on their first render. Eliminates the auth flicker that
  // made auth-gated UI (header icons, favorite buttons, the phone
  // gate, the bid composer state) pop in / pop out as the local
  // getUser() fetch resolved.
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();
  const initialUser = mapUser(rawUser);

  return (
    <NextIntlClientProvider>
      <AuthProvider initialUser={initialUser}>
        <ScrollToTop />
        <ToastProvider>{children}</ToastProvider>
        <OfflineOverlay />
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
