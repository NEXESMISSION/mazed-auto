import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/admin/kit";
import { currencyLabel, formatTND } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { categoryLabel, governorateLabel, type CategoryNames } from "@/lib/labels";
import { Eye, Heart, Phone, RotateCcw, Users } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Audience — what actually happens to an annonce after it is published.
 *
 * Until 0173 this could not be asked. `listings.view_count` existed and nothing
 * ever wrote to it, so every annonce on the site reported zero and there was no
 * way to tell a listing nobody opened from one fifty people opened and none of
 * them called. Those two need opposite fixes — the first needs a better title
 * and photos, the second needs a lower price — and they looked identical.
 *
 * WHAT THE NUMBERS MEAN, precisely, because a "view" can mean four things:
 *
 *   Visiteurs  distinct people. One person refreshing ten times is one.
 *   Vues       their visits added up, so someone who came back twice counts
 *              twice. A reload is not a visit: a repeat only counts after a
 *              30-minute gap.
 *   Retours    how many of those people came back at all, and how many extra
 *              visits they made between them.
 *   Favoris    saved the annonce.
 *   Numéro     asked to see the phone number — the only event on the page that
 *              means real intent, and the closest thing to a lead we have.
 *
 * `Taux` is Numéro ÷ Visiteurs: of the people who looked, how many asked to
 * call. It is the number that says whether an annonce is working.
 *
 * The seller's own visits are never counted, so nobody's ad is inflated by
 * their own refreshing.
 */

type Analytics = {
  listing_id: string;
  unique_viewers: number;
  total_views: number;
  returning_viewers: number;
  last_view_at: string | null;
  favourites: number;
  reveals: number;
  unique_revealers: number;
};

type Listing = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  price_on_request: boolean;
  governorate: string;
  published_at: string | null;
  category: CategoryNames | CategoryNames[] | null;
};

type SortKey = "views" | "visitors" | "returns" | "favourites" | "reveals" | "rate" | "recent";

/** Sort keys, each named under `admin.analytics.sorts`. */
const SORTS: SortKey[] = ["views", "visitors", "returns", "favourites", "reveals", "rate", "recent"];

/** Statuses this page names itself (`admin.analytics.status`); others show raw. */
const STATUSES = ["published", "pending_review", "draft", "rejected", "expired", "archived", "sold"];

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return formatDate(iso, locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; scope?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const t = await getTranslations("admin.analytics");
  const locale = await getLocale();
  const sort = (SORTS.find((s) => s === sp.sort) ?? "views") as SortKey;
  const publishedOnly = sp.scope !== "all";
  const statusName = (s: string) => (STATUSES.includes(s) ? t(`status.${s}`) : s);

  const admin = getServiceSupabase();
  if (!admin) {
    return (
      <div className="p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("shortTitle")} />
        <p className="mt-6 text-[13px] text-muted">{t("unavailable")}</p>
      </div>
    );
  }

  let lq = admin
    .from("listings")
    .select(
      "id, title, status, price, price_on_request, governorate, published_at, category:categories (slug, label_fr, label_ar)",
    )
    .neq("status", "draft")
    .order("published_at", { ascending: false })
    .limit(300);
  if (publishedOnly) lq = lq.eq("status", "published");

  const { data: listingRows } = await lq;
  const listings = (listingRows ?? []) as unknown as Listing[];

  const byId = new Map<string, Analytics>();
  if (listings.length > 0) {
    const { data: stats } = await admin
      .from("listing_analytics")
      .select("*")
      .in("listing_id", listings.map((l) => l.id));
    for (const s of (stats ?? []) as Analytics[]) byId.set(s.listing_id, s);
  }

  const rows = listings.map((l) => {
    const a = byId.get(l.id);
    const visitors = a?.unique_viewers ?? 0;
    const views = a?.total_views ?? 0;
    const reveals = a?.reveals ?? 0;
    return {
      listing: l,
      visitors,
      views,
      // Extra visits beyond the first — literally "how many times they came
      // back", which is the question the counter was built to answer.
      repeats: Math.max(0, views - visitors),
      returners: a?.returning_viewers ?? 0,
      favourites: a?.favourites ?? 0,
      reveals,
      // Reveals were being recorded long before views were (0173). On an older
      // annonce that gives more reveals than visitors — a rate above 100 %,
      // which reads as a bug rather than as history. Rather than capping it,
      // which would state a number that is not true, the rate is withheld
      // until the two are measured over the same period.
      rate: reveals > visitors ? null : pct(reveals, visitors),
      lastView: a?.last_view_at ?? null,
    };
  });

  rows.sort((a, b) => {
    switch (sort) {
      case "visitors": return b.visitors - a.visitors;
      case "returns": return b.returners - a.returners || b.repeats - a.repeats;
      case "favourites": return b.favourites - a.favourites;
      case "reveals": return b.reveals - a.reveals;
      case "rate": return (b.rate ?? -1) - (a.rate ?? -1) || b.visitors - a.visitors;
      case "recent": return (b.lastView ?? "").localeCompare(a.lastView ?? "");
      default: return b.views - a.views;
    }
  });

  const totals = rows.reduce(
    (t, r) => ({
      visitors: t.visitors + r.visitors,
      views: t.views + r.views,
      repeats: t.repeats + r.repeats,
      favourites: t.favourites + r.favourites,
      reveals: t.reveals + r.reveals,
    }),
    { visitors: 0, views: 0, repeats: 0, favourites: 0, reveals: 0 },
  );

  const qs = (next: Partial<{ sort: SortKey; scope: string }>) => {
    const p = new URLSearchParams();
    p.set("sort", next.sort ?? sort);
    const scope = next.scope ?? (publishedOnly ? "published" : "all");
    if (scope === "all") p.set("scope", "all");
    return `/admin/analytics?${p.toString()}`;
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        stat={{ value: totals.views, label: t("totalViews") }}
      />

      {/* The five numbers for the whole site, so a single bad annonce is not
          mistaken for a bad week. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric Icon={Users} label={t("metrics.visitors.label")} value={totals.visitors} hint={t("metrics.visitors.hint")} />
        <Metric Icon={Eye} label={t("metrics.views.label")} value={totals.views} hint={t("metrics.views.hint")} />
        <Metric Icon={RotateCcw} label={t("metrics.repeats.label")} value={totals.repeats} hint={t("metrics.repeats.hint")} />
        <Metric Icon={Heart} label={t("metrics.favourites.label")} value={totals.favourites} hint={t("metrics.favourites.hint")} />
        <Metric Icon={Phone} label={t("metrics.reveals.label")} value={totals.reveals} hint={t("metrics.reveals.hint")} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
          {t("sortBy")}
        </span>
        {SORTS.map((s) => (
          <Link
            key={s}
            href={qs({ sort: s }) as never}
            className={
              "rounded-full px-3 py-1.5 text-[12px] font-bold transition " +
              (sort === s
                ? "bg-foreground text-background"
                : "bg-surface-2 text-muted ring-1 ring-border hover:text-foreground")
            }
          >
            {t(`sorts.${s}`)}
          </Link>
        ))}
        <Link
          href={qs({ scope: publishedOnly ? "all" : "published" }) as never}
          className="ms-auto rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-muted ring-1 ring-border hover:text-foreground"
        >
          {publishedOnly ? t("includeUnpublished") : t("onlineOnly")}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center text-[13px] text-muted">
          {t("empty")}
        </p>
      ) : (
        <>
          {/* Desktop: one line per annonce. */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border lg:block">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                  <Th className="text-start">{t("columns.listing")}</Th>
                  <Th>{t("columns.visitors")}</Th>
                  <Th>{t("columns.views")}</Th>
                  <Th>{t("columns.returns")}</Th>
                  <Th>{t("columns.favourites")}</Th>
                  <Th>{t("columns.reveals")}</Th>
                  <Th>{t("columns.rate")}</Th>
                  <Th>{t("columns.lastView")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.listing.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/annonces/${r.listing.id}` as never}
                        className="font-bold text-foreground hover:text-gold"
                      >
                        {r.listing.title}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {one(r.listing.category) ? categoryLabel(one(r.listing.category), locale) : "—"} · {governorateLabel(r.listing.governorate, locale)}
                        {r.listing.status !== "published" && (
                          <span className="ms-1.5 font-bold text-[var(--accent-deep)]">
                            {statusName(r.listing.status)}
                          </span>
                        )}
                        {" · "}
                        {r.listing.price_on_request || r.listing.price == null
                          ? t("onRequest")
                          : `${formatTND(Number(r.listing.price), locale)} ${currencyLabel(locale)}`}
                      </div>
                    </td>
                    <Num>{r.visitors}</Num>
                    <Num>{r.views}</Num>
                    <td className="batta-tabular px-3 py-2.5 text-center">
                      <span className="font-bold text-foreground">{r.returners}</span>
                      {r.repeats > 0 && (
                        <span className="ms-1 text-[11px] text-muted">(+{r.repeats})</span>
                      )}
                    </td>
                    <Num>{r.favourites}</Num>
                    <Num>{r.reveals}</Num>
                    <td className="batta-tabular px-3 py-2.5 text-center">
                      <span
                        className={
                          "font-bold " +
                          (r.rate != null && r.rate >= 20 ? "text-gold" : "text-foreground")
                        }
                        title={r.rate == null ? t("rateWithheld") : undefined}
                      >
                        {r.rate != null && r.visitors > 0 ? `${r.rate} %` : "—"}
                      </span>
                    </td>
                    <td className="batta-tabular px-3 py-2.5 text-center text-[11.5px] text-muted">
                      {fmtDate(r.lastView, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same rows, stacked. A table this wide is unreadable on
              a phone and an admin does check things from one. */}
          <ul className="mt-4 space-y-2 lg:hidden">
            {rows.map((r) => (
              <li key={r.listing.id} className="rounded-2xl border border-border bg-surface p-3.5">
                <Link
                  href={`/annonces/${r.listing.id}` as never}
                  className="text-[14px] font-bold text-foreground"
                >
                  {r.listing.title}
                </Link>
                <p className="mt-0.5 text-[11px] text-muted">
                  {one(r.listing.category) ? categoryLabel(one(r.listing.category), locale) : "—"} · {governorateLabel(r.listing.governorate, locale)}
                  {r.listing.status !== "published" && (
                    <span className="ms-1.5 font-bold text-[var(--accent-deep)]">
                      {statusName(r.listing.status)}
                    </span>
                  )}
                </p>
                <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  <Cell label={t("columns.visitors")} value={r.visitors} />
                  <Cell label={t("columns.views")} value={r.views} />
                  <Cell label={t("columns.returns")} value={r.returners} extra={r.repeats > 0 ? `+${r.repeats}` : undefined} />
                  <Cell label={t("columns.favourites")} value={r.favourites} />
                  <Cell label={t("columns.reveals")} value={r.reveals} />
                  <Cell label={t("columns.rate")} value={r.rate != null && r.visitors > 0 ? `${r.rate} %` : "—"} />
                </dl>
                <p className="mt-2 text-[10.5px] text-muted">{t("lastViewAt", { when: fmtDate(r.lastView, locale) })}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 text-[11.5px] leading-relaxed text-muted">
        {t("footnote")}
      </p>
    </div>
  );
}

function Metric({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: typeof Eye;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5">
      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
        <Icon className="size-3.5" /> {label}
      </span>
      <div className="batta-tabular mt-1 text-[24px] font-extrabold leading-none text-foreground">
        {value}
      </div>
      <p className="mt-1 text-[10.5px] text-muted">{hint}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-extrabold ${className || "text-center"}`}>{children}</th>;
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="batta-tabular px-3 py-2.5 text-center font-bold text-foreground">{children}</td>
  );
}

function Cell({
  label,
  value,
  extra,
}: {
  label: string;
  value: number | string;
  extra?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2 p-2 ring-1 ring-border">
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="batta-tabular mt-0.5 text-[15px] font-extrabold text-foreground">
        {value}
        {extra && <span className="ms-1 text-[10.5px] font-bold text-muted">{extra}</span>}
      </dd>
    </div>
  );
}
