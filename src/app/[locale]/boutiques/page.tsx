import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { GOVERNORATES } from "@/lib/governorates";
import { SHOP_PUBLIC_SELECT, shopMediaUrl, shopsGate, type PublicShop } from "@/lib/shops/public";
import { ACTIVITY_SLUG, activityLabel, isShopVerified, shopInitials } from "@/lib/shops/format";
import { BadgeCheck, MapPin, Store } from "lucide-react";
import { ShopsPreviewBanner } from "./ShopsPreviewBanner";
import { jsonLdSafe } from "@/lib/jsonld";
import { siteUrl } from "@/lib/siteUrl";
import { OG_IMAGE } from "@/lib/ogImage";
import { localeAlternates } from "@/i18n/alternates";
import { ogLocale } from "@/i18n/routing";
import { governorateLabel } from "@/lib/labels";

// Filters (?activite, ?gov, ?verifie) are views of one page: they all point
// search engines at the unfiltered directory, in the page's language.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shops.meta" });
  const title = t("directoryTitle");
  const description = t("directoryDescription");
  return {
    title,
    description,
    alternates: localeAlternates(locale, "/boutiques"),
    openGraph: { type: "website", url: `/${locale}/boutiques`, title, description, siteName: "Mazed Auto", locale: ogLocale(locale), images: [OG_IMAGE] },
  };
}

// Reads the shops and the public switch on every request.
export const dynamic = "force-dynamic";

type SearchParams = { activite?: string; gov?: string; verifie?: string };

/**
 * Boutiques — the directory of professional shops.
 *
 * Only ACTIVE shops, read through the columns a visitor may see
 * (SHOP_PUBLIC_SELECT: no phone, no owner). Filters are plain links, so a
 * filtered directory is a URL that can be shared. The « vérifiée » filter
 * means verified by Mazed — the only way a shop gets the badge (recette 10).
 */
export default async function BoutiquesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = getServiceSupabase();
  if (!admin) notFound();
  const gate = await shopsGate(admin);
  if (!gate.visible) notFound();

  const locale = await getLocale();
  const t = await getTranslations("shops");
  const sp = await searchParams;
  const activity = sp.activite ? ACTIVITY_SLUG[sp.activite] ?? null : null;
  const gov = sp.gov && (GOVERNORATES as readonly string[]).includes(sp.gov) ? sp.gov : null;
  const verifiedOnly = sp.verifie === "1";

  let query = admin
    .from("shops")
    .select(SHOP_PUBLIC_SELECT)
    .eq("status", "active")
    .order("verification_status", { ascending: false })
    .order("name");
  if (activity) query = query.eq("activity_type", activity);
  if (gov) query = query.eq("governorate", gov);
  if (verifiedOnly) query = query.eq("verification_status", "verified");
  const { data } = await query.limit(200);
  const shops = (data ?? []) as unknown as PublicShop[];

  // Live annonces per shop, in one read.
  const counts = new Map<string, number>();
  if (shops.length > 0) {
    const { data: rows } = await admin
      .from("listings")
      .select("shop_id")
      .eq("status", "published")
      .in("shop_id", shops.map((s) => s.id));
    for (const r of rows ?? []) {
      const id = r.shop_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const href = (patch: Partial<SearchParams>) => {
    const next = { activite: sp.activite, gov: gov ?? undefined, verifie: verifiedOnly ? "1" : undefined, ...patch };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return (s ? `/boutiques?${s}` : "/boutiques") as never;
  };
  const chip = (active: boolean) =>
    `inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 transition ${
      active
        ? "bg-foreground text-background ring-foreground"
        : "bg-surface text-foreground ring-border hover:ring-gold-soft"
    }`;

  const site = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("meta.listName"),
    itemListElement: shops.slice(0, 50).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site}/${locale}/boutiques/${s.slug}`,
      name: s.name,
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      {shops.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} />}
      {gate.preview && <ShopsPreviewBanner />}

      <header>
        <span className="batta-eyebrow">{t("directory.eyebrow")}</span>
        <h1 className="mt-1 text-[26px] font-black tracking-tight lg:text-[34px]">{t("directory.title")}</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          {t("directory.intro")}
        </p>
      </header>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label={t("directory.activityNav")}>
        <Link href={href({ activite: undefined })} className={chip(!activity)}>{t("directory.all")}</Link>
        <Link href={href({ activite: "vente" })} className={chip(activity === "vente_auto")}>{t("directory.sale")}</Link>
        <Link href={href({ activite: "location" })} className={chip(activity === "location_auto")}>{t("directory.rental")}</Link>
        <Link href={href({ activite: "pieces" })} className={chip(activity === "pieces_auto")}>{t("directory.parts")}</Link>
        <Link
          href={href({ verifie: verifiedOnly ? undefined : "1" })}
          className={chip(verifiedOnly)}
        >
          <BadgeCheck className="me-1 size-3.5" /> {t("directory.verified")}
        </Link>
      </nav>

      <nav className="mt-2 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 text-[12px]" aria-label={t("directory.governorateNav")}>
        <Link href={href({ gov: undefined })} className={`${chip(!gov)} shrink-0`}>{t("directory.allTunisia")}</Link>
        {GOVERNORATES.map((g) => (
          <Link key={g} href={href({ gov: g })} className={`${chip(gov === g)} shrink-0`}>{governorateLabel(g, locale)}</Link>
        ))}
      </nav>

      {shops.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center">
          <Store className="mx-auto size-7 text-muted" />
          <p className="mt-2 text-[13.5px] font-bold">{t("directory.none")}</p>
          <Link href={"/boutiques" as never} className="mt-1 inline-block text-[12.5px] font-bold text-gold hover:underline">
            {t("directory.seeAll")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((s) => {
            const logo = shopMediaUrl(s.logo_path);
            const n = counts.get(s.id) ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/boutiques/${s.slug}` as never}
                  className="press flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-gold-soft"
                >
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-[17px] font-black text-muted ring-1 ring-border">
                    {logo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={logo} alt="" className="size-full object-cover" />
                    ) : (
                      shopInitials(s.name)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14.5px] font-extrabold text-foreground">{s.name}</span>
                      {isShopVerified(s) && (
                        <BadgeCheck className="size-4 shrink-0 text-gold" aria-label={t("directory.verifiedShop")} />
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] font-bold text-muted">
                      {activityLabel(s.activity_type, locale)}
                    </span>
                    <span className="mt-1 flex items-center gap-3 text-[11.5px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {[s.city, governorateLabel(s.governorate, locale)].filter(Boolean).join(locale === "ar" ? "، " : ", ")}
                      </span>
                      <span>{t("directory.listings", { count: n })}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
