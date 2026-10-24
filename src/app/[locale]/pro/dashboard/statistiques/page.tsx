import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { getProContext } from "@/lib/shops/proContext";
import { DailyColumns } from "./DailyColumns";
import { Eye, MessageCircle, Phone, Store } from "lucide-react";

type Day = { day: string; shop_views: number; listing_views: number; phone_reveals: number; whatsapp_clicks: number };
type Line = {
  id: string; title: string; status: string; views: number; reveals: number; favourites: number;
  total_views: number; total_reveals: number;
};
type Stats = { from: string; to: string; daily: Day[]; listings: Line[] };

const PERIODS = [7, 30, 90] as const;

// Status words: the annonces tab's, under `pro.listings.status`.
const STATUSES = ["published", "pending_review", "paused", "expired", "archived", "sold", "rejected", "pending_payment", "draft"];

/**
 * Statistiques — what the shop's page and annonces drew, per day and per
 * annonce (0193). Visitors are counted once a day each; the shop's own members
 * are never counted. There is no « sales » figure, on purpose: sales happen
 * between the shop and the buyer, and we do not see them.
 */
export default async function ProStatsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop } = ctx;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("pro.stats");
  const ts = await getTranslations("pro.listings.status");
  const n = (v: number) => v.toLocaleString("fr-FR");
  const days = PERIODS.includes(Number(sp.p) as (typeof PERIODS)[number]) ? Number(sp.p) : 30;

  const { data } = await admin.rpc("shop_stats", { p_shop: shop.id, p_days: days });
  const stats = (data ?? { daily: [], listings: [] }) as Stats;
  const sum = (k: keyof Omit<Day, "day">) => stats.daily.reduce((s, d) => s + d[k], 0);
  const dayLabel = (iso: string) => formatDate(`${iso}T12:00:00`, locale, { weekday: "short", day: "numeric", month: "short" });

  const tiles = [
    { label: t("tiles.shopViews"), value: sum("shop_views"), Icon: Store },
    { label: t("tiles.listingViews"), value: sum("listing_views"), Icon: Eye },
    { label: t("tiles.reveals"), value: sum("phone_reveals"), Icon: Phone },
    { label: t("tiles.whatsapp"), value: sum("whatsapp_clicks"), Icon: MessageCircle },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">{t("hint")}</p>
        <nav className="flex gap-1.5" aria-label={t("period")}>
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/pro/dashboard/statistiques?p=${p}` as never}
              aria-current={p === days ? "page" : undefined}
              className={`tap-target rounded-full border px-3 py-1.5 text-[12px] font-bold ${
                p === days ? "border-gold-soft bg-gold-faint text-gold" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {t("days", { days: p })}
            </Link>
          ))}
        </nav>
      </div>

      <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {tiles.map(({ label, value, Icon }) => (
          <li key={label} className="rounded-2xl border border-border bg-surface p-3.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-muted">
              <Icon className="size-3.5" /> {label}
            </p>
            <p className="batta-tabular mt-1 text-[26px] font-black">{n(value)}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 lg:grid-cols-2">
        <DailyColumns
          title={t("visitsChart")}
          days={stats.daily.map((d) => d.day)}
          values={stats.daily.map((d) => d.shop_views + d.listing_views)}
        />
        <DailyColumns
          title={t("contactsChart")}
          days={stats.daily.map((d) => d.day)}
          values={stats.daily.map((d) => d.phone_reveals + d.whatsapp_clicks)}
        />
      </div>

      <details className="rounded-2xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-[13px] font-extrabold">{t("byDay")}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-muted">
              <tr className="text-start">
                <th className="py-1 pe-3 text-start font-bold">{t("col.day")}</th>
                <th className="py-1 pe-3 text-end font-bold">{t("col.shop")}</th>
                <th className="py-1 pe-3 text-end font-bold">{t("col.listings")}</th>
                <th className="py-1 pe-3 text-end font-bold">{t("col.reveals")}</th>
                <th className="py-1 text-end font-bold">{t("col.whatsapp")}</th>
              </tr>
            </thead>
            <tbody className="batta-tabular divide-y divide-border">
              {[...stats.daily].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="py-1 pe-3">{dayLabel(d.day)}</td>
                  <td className="py-1 pe-3 text-end">{d.shop_views}</td>
                  <td className="py-1 pe-3 text-end">{d.listing_views}</td>
                  <td className="py-1 pe-3 text-end">{d.phone_reveals}</td>
                  <td className="py-1 text-end">{d.whatsapp_clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("byListing", { days })}</h2>
        {stats.listings.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">{t("noListings")}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead className="text-[11.5px] text-muted">
                <tr>
                  <th className="py-1.5 pe-3 text-start font-bold">{t("col.listing")}</th>
                  <th className="py-1.5 pe-3 text-end font-bold">{t("col.visits")}</th>
                  <th className="py-1.5 pe-3 text-end font-bold">{t("col.reveals")}</th>
                  <th className="py-1.5 pe-3 text-end font-bold">{t("col.favourites")}</th>
                  <th className="py-1.5 text-end font-bold">{t("col.sincePublished")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.listings.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-[240px] py-1.5 pe-3">
                      <Link href={`/annonces/${l.id}` as never} className="block truncate font-bold hover:text-gold">{l.title}</Link>
                      <span className="text-[11px] text-muted">{STATUSES.includes(l.status) ? ts(l.status) : l.status}</span>
                    </td>
                    <td className="batta-tabular py-1.5 pe-3 text-end">{l.views}</td>
                    <td className="batta-tabular py-1.5 pe-3 text-end">{l.reveals}</td>
                    <td className="batta-tabular py-1.5 pe-3 text-end">{l.favourites}</td>
                    <td className="batta-tabular py-1.5 text-end text-muted">{t("totals", { views: l.total_views, reveals: l.total_reveals })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11.5px] text-muted">
        {t("noSales")}
      </p>
    </div>
  );
}
