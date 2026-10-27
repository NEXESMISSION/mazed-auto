import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/legal/LegalPage";
import { localeAlternates } from "@/i18n/alternates";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchSiteContact, formatPhone, telHref, whatsappHref } from "@/lib/siteContact";
import { Mail, Phone, MapPin, Clock, MessageCircle } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.contact" });
  return { title: t("metaTitle"), alternates: localeAlternates(locale, "/contact") };
}

// Static: prerendered at build for each locale (generateStaticParams in the
// [locale] layout) and served from the edge CDN, because nothing here reads a
// request. NOT `dynamic = "force-static"`: under it next-intl lost the locale
// that setRequestLocale sets, and /ar rendered this page — and the site's bars
// around it — in French.
//
// The details come from Réglages (D-B3): saving them there regenerates this
// page at once (revalidatePath); the hour is only a safety net.
export const revalidate = 3600;

type Item = { Icon: typeof Mail; key: string; value: string | null; href: string | null; ltr: boolean };

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  // Static page: next-intl must be told the locale, it cannot read a header.
  setRequestLocale(locale);
  const t = await getTranslations("info.contact");
  const contact = await fetchSiteContact(getServiceSupabase());
  /** `ltr`: kept in Latin reading order whatever the page's direction (an e-mail, a number). */
  const ITEMS: Item[] = [
    { Icon: Mail, key: "email", value: contact.email, href: `mailto:${contact.email}`, ltr: true },
    { Icon: Phone, key: "phone", value: formatPhone(contact.phone), href: telHref(contact.phone), ltr: true },
    ...(contact.whatsapp
      ? [{ Icon: MessageCircle, key: "whatsapp", value: formatPhone(contact.whatsapp), href: whatsappHref(contact.whatsapp), ltr: true }]
      : []),
    { Icon: MapPin, key: "address", value: contact.address || null, href: null, ltr: false },
    { Icon: Clock, key: "hours", value: null, href: null, ltr: false },
  ];
  return (
    <LegalPage eyebrow={t("eyebrow")} title={t("title")}>
      <p className="text-[13.5px] leading-relaxed text-foreground/80">
        {t("intro")}
      </p>
      <ul className="mt-5 space-y-2.5">
        {ITEMS.map((it) => {
          const inner = (
            <>
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-faint text-gold ring-1 ring-gold/30">
                <it.Icon className="size-4.5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">
                  {t(it.key)}
                </div>
                <div className="mt-0.5 text-[14px] font-bold text-foreground">
                  {it.ltr ? <span className="ltr-island">{it.value}</span> : it.value ?? t(`${it.key}Value`)}
                </div>
              </div>
            </>
          );
          return (
            <li key={it.key}>
              {it.href ? (
                <a
                  href={it.href}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5 ring-1 ring-border transition hover:ring-gold-soft/60"
                >
                  {inner}
                </a>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5 ring-1 ring-border">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </LegalPage>
  );
}
