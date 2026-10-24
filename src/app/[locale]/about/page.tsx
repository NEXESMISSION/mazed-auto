import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/i18n/alternates";
import { ChevronLeft, Target, Heart, Award, ArrowRight } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.about" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/about"),
  };
}

// Static: prerendered at build for each locale (generateStaticParams in the
// [locale] layout) and served from the edge CDN, because nothing here reads a
// request. NOT `dynamic = "force-static"`: under it next-intl lost the locale
// that setRequestLocale sets, and /ar rendered this page — and the site's bars
// around it — in French.

export default async function AboutPage({ params }: Props) {
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

      {/* Editorial header */}
      <header className="mt-6 space-y-3 text-center">
        <span className="batta-eyebrow block">Mazed Auto</span>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-[34px]">
          {t.rich("about.title", { gold: (c) => <span className="gradient-gold-text">{c}</span> })}
        </h1>
        <p className="mx-auto max-w-xl text-[13.5px] leading-relaxed text-muted lg:text-[14.5px]">
          {t("about.intro")}
        </p>
      </header>

      {/* Vision / mission / values */}
      <section className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ValueCard
          icon={<Target className="size-5" />}
          title={t("about.vision.title")}
          text={t("about.vision.text")}
        />
        <ValueCard
          icon={<Heart className="size-5" />}
          title={t("about.mission.title")}
          text={t("about.mission.text")}
        />
        <ValueCard
          icon={<Award className="size-5" />}
          title={t("about.values.title")}
          text={t("about.values.text")}
        />
      </section>

      {/* Story */}
      <section className="mt-10 rounded-2xl bg-surface p-5 ring-1 ring-border lg:p-7">
        <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">
          {t("about.storyTitle")}
        </h2>
        <div className="mt-3 space-y-4 text-[13.5px] leading-relaxed text-foreground/80">
          <p>{t("about.story1")}</p>
          <p>{t("about.story2")}</p>
          <p>{t("about.story3")}</p>
        </div>
      </section>

      {/* Closing CTA */}
      <div className="mt-10 text-center">
        <Link
          href="/annonces"
          className="batta-btn-luxe h-11 rounded-xl px-6 text-[13px] lg:text-sm"
        >
          {t("about.cta")}
          <ArrowRight className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
    </div>
  );
}

function ValueCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-5 text-center ring-1 ring-border transition hover:ring-gold-soft/60">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gold-faint text-gold ring-1 ring-gold/25">
        {icon}
      </div>
      <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}
