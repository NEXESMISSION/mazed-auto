import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { governorateLabel } from "@/lib/labels";
import { Link } from "@/i18n/navigation";
import { getProContext } from "@/lib/shops/proContext";
import { activityLabel, isShopVerified, shopInitials } from "@/lib/shops/format";
import { shopMediaUrl, shopsGate } from "@/lib/shops/public";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ProTabs } from "./ProTabs";
import { socialGate } from "@/lib/social/gate";
import { ArrowUpRight, BadgeCheck, Store } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pro.layout" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

/**
 * Espace pro — the frame around every dashboard page: which shop this is, its
 * sections, and the way to its public page.
 *
 * Signed out → login, then back here. Signed in without a shop → the way to
 * open one (/pro/creer) once shops are open, otherwise a plain explanation.
 */
export default async function ProDashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getProContext();
  const locale = await getLocale();
  if (ctx.kind === "anonymous") {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/pro/dashboard`)}`);
  }
  const t = await getTranslations("pro.layout");

  if (ctx.kind === "no_shop") {
    const admin = getServiceSupabase();
    const canOpen = admin ? (await shopsGate(admin)).visible : false;
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted ring-1 ring-border">
          <Store className="size-6" />
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold tracking-tight">{t("noShopTitle")}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {t("noShopBody")}{" "}
          {canOpen ? t("noShopCanOpen") : t("noShopSoon")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href={(canOpen ? "/pro/creer" : "/contact") as never}
            className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]"
          >
            {canOpen ? t("open") : t("contact")}
          </Link>
          <Link
            href={"/account/listings" as never}
            className="tap-target rounded-full border border-border px-4 py-2.5 text-[13px] font-bold hover:border-gold-soft"
          >
            {t("personal")}
          </Link>
        </div>
      </main>
    );
  }

  const { shop } = ctx;
  const marketing = (await socialGate(ctx.admin)).visible;
  const logo = shopMediaUrl(shop.logo_path);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-10">
      <header className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-[15px] font-black text-foreground/70 ring-1 ring-border">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt="" className="size-full object-cover" />
          ) : (
            shopInitials(shop.name)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className="batta-eyebrow">{t("eyebrow")}</span>
          <h1 className="flex items-center gap-1.5 truncate text-[20px] font-extrabold tracking-tight lg:text-[26px]">
            {shop.name}
            {isShopVerified(shop) && <BadgeCheck className="size-5 shrink-0 text-gold" aria-label={t("verified")} />}
          </h1>
          <p className="text-[12px] text-muted">{activityLabel(shop.activity_type, locale)} · {governorateLabel(shop.governorate, locale)}</p>
        </div>
        {shop.status === "active" && (
          <Link
            href={`/boutiques/${shop.slug}` as never}
            className="hidden shrink-0 items-center gap-1 text-[12.5px] font-bold text-gold hover:underline sm:inline-flex"
          >
            {t("viewPage")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </Link>
        )}
      </header>
      <ProTabs marketing={marketing} />
      <div className="mt-5">{children}</div>
    </main>
  );
}
