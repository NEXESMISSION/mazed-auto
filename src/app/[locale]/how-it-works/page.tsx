import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/i18n/alternates";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchListingRules } from "@/lib/listingRules";
import {
  ChevronLeft,
  Search,
  Tag,
  Phone,
  Handshake,
  ShieldCheck,
  FileCheck,
  Camera,
  Wallet,
  Award,
  Timer,
  ArrowRight,
} from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.howItWorks" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/how-it-works"),
  };
}

// Static: prerendered at build for each locale (generateStaticParams in the
// [locale] layout) and served from the edge CDN, because nothing here reads a
// request. NOT `dynamic = "force-static"`: under it next-intl lost the locale
// that setRequestLocale sets, and /ar rendered this page — and the site's bars
// around it — in French.
//
// The publication length it states comes from Réglages (D-B5): saving it
// there regenerates this page at once; the hour is only a safety net.
export const revalidate = 3600;

type Icon = React.ComponentType<{ className?: string }>;

const BUYER_STEPS: { key: string; Icon: Icon }[] = [
  { key: "s1", Icon: Search },
  { key: "s2", Icon: Tag },
  { key: "s3", Icon: Phone },
  { key: "s4", Icon: Handshake },
];

const SELLER_STEPS: { key: string; Icon: Icon }[] = [
  { key: "s1", Icon: Camera },
  { key: "s2", Icon: Phone },
  { key: "s3", Icon: FileCheck },
  { key: "s4", Icon: Wallet },
  { key: "s5", Icon: ShieldCheck },
];

const TRUST: { key: string; Icon: Icon }[] = [
  { key: "review", Icon: Search },
  { key: "diagnostic", Icon: Award },
  { key: "badge", Icon: ShieldCheck },
  { key: "attestation", Icon: FileCheck },
  { key: "contact", Icon: Phone },
  { key: "limited", Icon: Timer },
];

export default async function HowItWorksPage({ params }: Props) {
  const { locale } = await params;
  // Static page: next-intl must be told the locale, it cannot read a header.
  setRequestLocale(locale);
  const t = await getTranslations("info");
  const { validityDays: days } = await fetchListingRules(getServiceSupabase());
  const gold = (c: React.ReactNode) => <span className="gradient-gold-text">{c}</span>;

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 py-6 lg:max-w-[var(--max-w-content)] lg:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        <ChevronLeft className="size-4 rtl:-scale-x-100" /> {t("home")}
      </Link>

      {/* Editorial header */}
      <header className="mt-6 space-y-3 text-center">
        <span className="batta-eyebrow block">{t("howItWorks.eyebrow")}</span>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-[34px]">
          {t.rich("howItWorks.title", { gold })}
        </h1>
        <p className="mx-auto max-w-xl text-[13.5px] leading-relaxed text-muted lg:text-[14.5px]">
          {t("howItWorks.intro")}
        </p>
      </header>

      {/* Buyer journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">{t("howItWorks.buyerEyebrow")}</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          {t("howItWorks.buyerTitle")}
        </h2>
        <div className="space-y-3">
          {BUYER_STEPS.map((s, i) => (
            <FlowStep
              key={s.key}
              num={i + 1}
              icon={<s.Icon className="size-5" />}
              title={t(`howItWorks.buyer.${s.key}.title`)}
              text={t(`howItWorks.buyer.${s.key}.text`)}
            />
          ))}
        </div>
      </section>

      {/* Seller journey */}
      <section className="mt-12">
        <span className="batta-eyebrow block">{t("howItWorks.sellerEyebrow")}</span>
        <h2 className="mb-5 mt-1.5 text-xl font-extrabold tracking-tight lg:text-2xl">
          {t("howItWorks.sellerTitle")}
        </h2>
        <div className="space-y-3">
          {SELLER_STEPS.map((s, i) => (
            <FlowStep
              key={s.key}
              num={i + 1}
              icon={<s.Icon className="size-5" />}
              title={t(`howItWorks.seller.${s.key}.title`)}
              text={t(`howItWorks.seller.${s.key}.text`, { days })}
            />
          ))}
        </div>
      </section>

      {/* Trust block */}
      <section className="mt-12 rounded-2xl bg-surface p-6 ring-1 ring-gold-soft/30 lg:p-8">
        <div className="mb-6 text-center">
          <Award className="mx-auto mb-3 size-10 text-gold" />
          <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">
            {t.rich("howItWorks.trustTitle", { gold })}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {t("howItWorks.trustBody")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TRUST.map((it) => (
            <TrustItem
              key={it.key}
              icon={<it.Icon className="size-4" />}
              text={t(`howItWorks.trust.${it.key}`)}
            />
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <div className="mt-12 text-center">
        <Link
          href="/signup"
          className="batta-btn-luxe h-11 rounded-xl px-6 text-[13px] lg:text-sm"
        >
          {t("howItWorks.cta")}
          <ArrowRight className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
    </div>
  );
}

function FlowStep({
  num,
  icon,
  title,
  text,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-surface p-4 ring-1 ring-border transition hover:ring-gold-soft/60">
      <div className="batta-tabular flex size-12 shrink-0 items-center justify-center rounded-full bg-gold-faint text-lg font-extrabold text-gold ring-1 ring-gold/25">
        {num}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-gold">{icon}</span>
          <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

function TrustItem({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
      <span className="shrink-0 text-gold">{icon}</span>
      <span className="text-[13px] font-semibold text-foreground">{text}</span>
    </div>
  );
}
