import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/i18n/alternates";
import {
  ChevronDown,
  ChevronLeft,
  KeyRound,
  LifeBuoy,
  Mail,
  Phone,
  ShieldCheck,
  Tag,
  Wallet,
} from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.help" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/help"),
  };
}

// Static: prerendered at build for each locale (generateStaticParams in the
// [locale] layout) and served from the edge CDN, because nothing here reads a
// request. NOT `dynamic = "force-static"`: under it next-intl lost the locale
// that setRequestLocale sets, and /ar rendered this page — and the site's bars
// around it — in French.

type Group = {
  /** Anchor id, and the key under `info.help.groups` / `info.help.faq`. */
  id: "compte" | "acheter" | "vendre" | "paiements" | "remise" | "litiges";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Keys of the questions under `info.help.faq.<id>`, in order. */
  items: string[];
};

/* The answers are content, not chrome — but they are the site's content in
   both languages, so they live in the `info` messages like everything else. */
const GROUPS: Group[] = [
  { id: "compte", Icon: ShieldCheck, items: ["create", "identity", "where"] },
  { id: "acheter", Icon: Tag, items: ["how", "pay", "badge", "part", "noAnswer"] },
  { id: "vendre", Icon: Wallet, items: ["publish", "cost", "contactShown", "duration", "refused", "false"] },
  { id: "paiements", Icon: Wallet, items: ["methods", "carPrice", "invoice"] },
  { id: "remise", Icon: KeyRound, items: ["handover", "documents", "delivery"] },
  { id: "litiges", Icon: LifeBuoy, items: ["problem", "mismatch", "report"] },
];

/** The tags an answer may use: emphasis, and the in-app links. */
const RICH = {
  b: (c: React.ReactNode) => <strong>{c}</strong>,
  listings: (c: React.ReactNode) => <FaqLink href="/account/listings">{c}</FaqLink>,
  favoris: (c: React.ReactNode) => <FaqLink href="/account/favoris">{c}</FaqLink>,
  parts: (c: React.ReactNode) => <FaqLink href="/annonces?kind=part">{c}</FaqLink>,
  contact: (c: React.ReactNode) => <FaqLink href="/contact">{c}</FaqLink>,
  publish: (c: React.ReactNode) => <FaqLink href="/annonces/nouvelle">{c}</FaqLink>,
  payments: (c: React.ReactNode) => <FaqLink href="/account/payments">{c}</FaqLink>,
};

export default async function HelpPage({ params }: Props) {
  const { locale } = await params;
  // Static page: next-intl must be told the locale, it cannot read a header.
  setRequestLocale(locale);
  const t = await getTranslations("info");

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 py-6 lg:max-w-[var(--max-w-content)] lg:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        <ChevronLeft className="size-4 rtl:-scale-x-100" /> {t("home")}
      </Link>

      {/* Hero header — same pattern as the other content pages. */}
      <header className="mt-5">
        <span className="batta-eyebrow block">{t("help.eyebrow")}</span>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight lg:text-[30px]">
          {t("help.title")}
        </h1>
        <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-muted">
          {t("help.intro")}
        </p>
      </header>

      {/* FAQ groups — native <details>, zero client JS. */}
      <div className="mt-7 space-y-7">
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`faq-${g.id}`}>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-faint text-gold ring-1 ring-gold/30">
                <g.Icon className="size-4" strokeWidth={2} />
              </span>
              <h2
                id={`faq-${g.id}`}
                className="text-[15px] font-extrabold tracking-tight"
              >
                {t(`help.groups.${g.id}`)}
              </h2>
            </div>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
              {g.items.map((key) => (
                <details key={key} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 text-[13.5px] font-semibold text-foreground">
                      {t(`help.faq.${g.id}.${key}.q`)}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-[13px] leading-relaxed text-muted">
                    {t.rich(`help.faq.${g.id}.${key}.a`, RICH)}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <section
        aria-label={t("help.supportAria")}
        className="mt-8 rounded-2xl bg-surface p-5 ring-1 ring-border lg:p-6"
      >
        <h2 className="text-[15px] font-extrabold tracking-tight">
          {t("help.notFound")}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {t("help.hours")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/contact"
            className="batta-btn-luxe rounded-full px-4 py-2 text-[12px] uppercase tracking-wider"
          >
            <LifeBuoy className="size-4" strokeWidth={2.2} />
            {t("help.contactCta")}
          </Link>
          <a
            href="mailto:contact@mazedauto.com"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[12px] font-bold text-foreground ring-1 ring-border transition hover:ring-gold-soft/60"
          >
            <Mail className="size-4 text-gold" strokeWidth={2} />
            contact@mazedauto.com
          </a>
          <a
            href="tel:+21698120622"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[12px] font-bold text-foreground ring-1 ring-border transition hover:ring-gold-soft/60"
          >
            <Phone className="size-4 text-gold" strokeWidth={2} />
            <span className="ltr-island">+216 98 120 622</span>
          </a>
        </div>
      </section>
    </div>
  );
}

/** Inline gold link used inside FAQ answers. */
function FaqLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-gold underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
