import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localeAlternates } from "@/i18n/alternates";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { fetchListingRules } from "@/lib/listingRules";
import { PRODUCT_SELECT, toProduct, type Product } from "@/lib/products";
import { currencyLabel } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "info.pricing" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/pricing"),
  };
}

// Prices come from the database, so this cannot be prerendered at build.
export const dynamic = "force-dynamic";

/**
 * Tarifs — what publishing costs, read from the same rows the routes charge by.
 *
 * The monthly Silver / Gold / Diamond plans that used to live here were
 * invented copy: no subscriptions backend existed, every CTA went to /contact,
 * and the quotas and percentages on the cards were placeholders. A price list
 * nobody can buy from is worse than no price list — it sets an expectation the
 * product cannot meet.
 *
 * Two models, one switch (`app_settings.personal_limits.free`, migration 0189):
 *   • free (D-P1, today): a private seller publishes 1 vehicle and 5 parts at
 *     a time for nothing; the limits come from the same setting the database
 *     enforces;
 *   • otherwise: the per-annonce price from `products` (0157), parts free
 *     (0167) — what the submit route charges when the switch is off.
 * Shop plans are not listed until an admin switches them on: a plan nobody can
 * buy yet is the same mistake as the old cards.
 */
export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("info.pricing");
  const admin = getServiceSupabase();
  // How long an annonce stays online (Réglages, D-B5).
  const { validityDays: days } = await fetchListingRules(admin);
  let products: Product[] = [];
  let personal = { vehicles: 1, parts: 5, free: true };
  let shopsOpen = false;
  if (admin) {
    const [{ data }, { data: limits }, { data: shopsSetting }] = await Promise.all([
      admin.from("products").select(PRODUCT_SELECT).eq("is_active", true).order("sort_order"),
      admin.from("app_settings").select("value").eq("key", "personal_limits").maybeSingle(),
      admin.from("app_settings").select("value").eq("key", "pro_shops").maybeSingle(),
    ]);
    shopsOpen = (shopsSetting?.value as { enabled?: boolean } | null)?.enabled === true;
    products = (data ?? []).map((r) => toProduct(r as Parameters<typeof toProduct>[0]));
    const v = (limits?.value ?? {}) as { vehicles?: number; parts?: number; free?: boolean };
    personal = {
      vehicles: Number.isFinite(v.vehicles) ? Number(v.vehicles) : personal.vehicles,
      parts: Number.isFinite(v.parts) ? Number(v.parts) : personal.parts,
      free: v.free !== false,
    };
  }

  const standard = products.find((p) => p.slug === "annonce-standard") ?? null;
  const part = products.find((p) => p.slug === "annonce-piece") ?? null;
  const renewal = products.find((p) => p.kind === "renewal") ?? null;
  const promos = products.filter((p) => p.kind === "promo");
  // Shops are for sale once their pages are public AND a plan is active.
  const shopsForSale = shopsOpen && products.some((p) => p.kind === "subscription");

  const price = (p: Product | null) =>
    p == null ? "—" : p.price <= 0 ? t("free") : `${p.price} ${currencyLabel(locale)}`;
  const vehicles = t("vehicles", { count: personal.vehicles });
  const parts = t("parts", { count: personal.parts });
  // A product's name in the page's language. French is the admin's own name;
  // in Arabic, the table's `name_ar` when an admin filled it, else the name
  // the messages give the slug, else the French one.
  const productName = (p: Product) =>
    locale !== "ar"
      ? p.nameFr
      : p.nameAr || (t.has(`products.${p.slug}`) ? t(`products.${p.slug}`) : p.nameFr);

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-4 pb-16 pt-6 lg:max-w-3xl lg:px-8 lg:pb-24 lg:pt-12">
      <header className="text-center">
        <h1 className="text-3xl font-black leading-tight tracking-tight lg:text-5xl">
          {personal.free ? t("titleFree") : t("titlePaid")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-muted lg:text-base">
          {personal.free ? t("introFree", { vehicles, parts }) : t("introPaid")}
        </p>
      </header>

      {/* The two prices that matter */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-12">
        <PriceCard
          title={t("vehicleCard.title")}
          price={personal.free ? t("free") : price(standard)}
          note={personal.free ? t("vehicleCard.noteFree", { vehicles, days }) : t("vehicleCard.notePaid", { days })}
          highlight
        />
        <PriceCard
          title={t("partCard.title")}
          price={personal.free ? t("free") : price(part)}
          note={personal.free ? t("partCard.noteFree", { parts }) : t("partCard.notePaid")}
        />
      </div>

      {personal.free && (
        <p className="mt-4 text-center text-[12.5px] text-muted">
          {shopsForSale
            ? t.rich("moreShopsOpen", {
                link: (c) => (
                  <Link href={"/pro" as never} className="font-semibold text-gold hover:underline">
                    {c}
                  </Link>
                ),
              })
            : t.rich("moreSoon", {
                link: (c) => (
                  <Link href="/contact" className="font-semibold text-gold hover:underline">
                    {c}
                  </Link>
                ),
              })}
        </p>
      )}

      {/* Options, only if the admin actually sells them */}
      {(renewal || promos.length > 0) && (
        <section className="mt-10">
          <h2 className="batta-eyebrow flex items-center gap-2">
            <span aria-hidden className="batta-gold-rule-short" />
            {t("options")}
          </h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {renewal && <OptionRow name={t("renew")} price={price(renewal)} />}
            {promos.map((p) => (
              <OptionRow key={p.slug} name={productName(p)} price={price(p)} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-border bg-surface p-5 lg:p-6">
        <h2 className="text-[15px] font-extrabold">{t("includedTitle")}</h2>
        <ul className="mt-3 space-y-2">
          {(["photos", "contact", "review", "edit"] as const).map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] text-foreground/85">
              <Check className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={2.4} />
              {t(`included.${line}`)}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/annonces/nouvelle"
          className="batta-btn-luxe tap-target inline-flex h-12 items-center gap-2 px-6 text-[14px]"
        >
          {t("publish")} <ArrowRight className="size-4 rtl:-scale-x-100" />
        </Link>
        <p className="mt-3 text-[12px] text-muted">
          {t.rich("billing", {
            link: (c) => (
              <Link href="/contact" className="font-semibold text-gold hover:underline">
                {c}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

function PriceCard({
  title,
  price,
  note,
  highlight,
}: {
  title: string;
  price: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight ? "border-gold/40 bg-[var(--gold-faint)]" : "border-border bg-surface"
      }`}
    >
      <div className="text-[12.5px] font-bold text-muted">{title}</div>
      <div className="batta-tabular gradient-gold-text mt-2 text-[38px] font-extrabold leading-none">
        {price}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function OptionRow({ name, price }: { name: string; price: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[13px] text-foreground/85">{name}</span>
      <span className="batta-tabular shrink-0 text-[13px] font-extrabold text-foreground">
        {price}
      </span>
    </li>
  );
}
