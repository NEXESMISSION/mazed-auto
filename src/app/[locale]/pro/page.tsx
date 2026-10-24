import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { shopsGate } from "@/lib/shops/public";
import { getProContext } from "@/lib/shops/proContext";
import { planName, plansForSale } from "@/lib/shops/plans";
import { currencyLabel, formatTND } from "@/lib/utils";
import { ShopsPreviewBanner } from "../boutiques/ShopsPreviewBanner";
import { BadgeCheck, Car, KeyRound, Wrench, Check, ArrowRight } from "lucide-react";
import { OG_IMAGE } from "@/lib/ogImage";
import { localeAlternates } from "@/i18n/alternates";
import { ogLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pro.landing" });
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    alternates: localeAlternates(locale, "/pro"),
    openGraph: { type: "website", url: `/${locale}/pro`, title, description, siteName: "Mazed Auto", locale: ogLocale(locale), images: [OG_IMAGE] },
  };
}

export const dynamic = "force-dynamic";

/**
 * /fr/pro — what a professional gets, and what it costs.
 *
 * The plans are read from `products`, active rows only: an offer an admin has
 * not switched on is not shown (D-P6 — prices are confirmed for sale only once
 * invoicing is settled). With none on sale yet the page says so and offers
 * contact instead of a dead button.
 */
export default async function ProLandingPage() {
  const admin = getServiceSupabase();
  if (!admin) notFound();
  const gate = await shopsGate(admin);
  if (!gate.visible) notFound();

  const [plans, ctx] = await Promise.all([plansForSale(admin), getProContext()]);
  const hasShop = ctx.kind === "shop";
  const locale = await getLocale();
  const t = await getTranslations("pro.landing");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      {gate.preview && <ShopsPreviewBanner />}

      <header className="text-center">
        <span className="batta-eyebrow">{t("eyebrow")}</span>
        <h1 className="mt-1 text-[28px] font-black leading-tight tracking-tight lg:text-[42px]">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted lg:text-base">
          {t("intro")}
        </p>
        <Link
          href={(hasShop ? "/pro/dashboard" : "/pro/creer") as never}
          className="batta-btn-luxe tap-target mt-5 inline-flex h-12 items-center gap-2 px-6 text-[14px]"
        >
          {hasShop ? t("mySpace") : t("open")} <ArrowRight className="size-4 rtl:rotate-180" />
        </Link>
      </header>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {([
          { Icon: Car, key: "sale" },
          { Icon: KeyRound, key: "rental" },
          { Icon: Wrench, key: "parts" },
        ] as const).map(({ Icon, key }) => (
          <div key={key} className="rounded-2xl border border-border bg-surface p-4">
            <Icon className="size-5 text-gold" />
            <h2 className="mt-2 text-[14.5px] font-extrabold">{t(`kinds.${key}.title`)}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t(`kinds.${key}.body`)}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-center text-[20px] font-extrabold tracking-tight">{t("plansTitle")}</h2>
        {plans.length === 0 ? (
          <p className="mx-auto mt-3 max-w-xl rounded-2xl border border-border bg-surface p-5 text-center text-[13px] text-muted">
            {t.rich("plansSoon", {
              link: (chunks) => <Link href={"/contact" as never} className="font-bold text-gold hover:underline">{chunks}</Link>,
            })}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <div key={p.code} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-[16px] font-extrabold">{planName(p, locale)}</h3>
                <p className="batta-tabular mt-2 text-[30px] font-black">
                  {formatTND(p.price, locale)}{" "}
                  <span className="text-[14px] font-bold text-muted">{currencyLabel(locale)} {t("perDays", { days: p.durationDays })}</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-[12.5px] text-foreground/85">
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> {t("vehicles", { count: p.limits.vehicles })}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> {t("parts", { count: formatTND(p.limits.parts, locale) })}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> {t("drafts")}</li>
                </ul>
              </div>
            ))}
          </div>
        )}
        <ul className="mx-auto mt-5 max-w-2xl space-y-1.5 text-[12px] leading-relaxed text-muted">
          {(["bucket", "drafts", "renewal", "end"] as const).map((k) => (
            <li key={k}>• {t(`rules.${k}`)}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-gold" />
        <p className="text-[13px] leading-relaxed text-muted">
          {t.rich("badge", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
        </p>
      </section>
    </main>
  );
}
