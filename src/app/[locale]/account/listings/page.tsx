/* eslint-disable react-hooks/purity -- Server Component.
 * The react-hooks v7 purity rule governs the CLIENT render path: it forbids
 * impure reads (Date.now(), Math.random()) during a render React may replay.
 * This module is an async Server Component — it runs once, per request, on the
 * server, and reading the clock is the correct way to answer "what is overdue"
 * or "which badge has lapsed". There is no render to replay. */
import { redirect } from "next/navigation";
import { coverPhoto } from "@/lib/listingCover";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { currencyLabel, formatTND } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { categoryLabel } from "@/lib/labels";
import {
  Plus, Ticket, ImageOff, Clock, CreditCard, PencilLine,
  ArrowRight, AlertTriangle, Inbox,
} from "lucide-react";
import { RenewButton } from "./RenewButton";
import { WithdrawButton } from "./WithdrawButton";
import { PaymentStatus } from "@/app/[locale]/pro/dashboard/abonnement/PaymentStatus";
import { PRODUCT_SELECT, isFree, resolveListingFee, toProduct, type Product } from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * Mes annonces — what the seller has, and what is waiting on whom.
 *
 * Rebuilt around the question this page is actually opened to answer: "is
 * anything blocked on me?". The four counts at the top used to be decoration —
 * you could read "2 à corriger" and then have to hunt for those two rows in a
 * list of thirty. They are tabs now, so the number and the way to act on it
 * are the same control.
 *
 * The second thing that was missing: a listing stuck at `pending_payment` had
 * no way forward from here at all — the seller had to dig up the notification
 * that carried the checkout link. Every row now offers the one action its
 * status implies: pay, resume the draft, renew, or view.
 */

/** Tone per status; the label and the hint are `myAccount.listings.status.<status>`. */
const STATUS: Record<string, { tone: string; hint?: true }> = {
  draft:           { tone: "bg-surface-2 text-muted ring-1 ring-border", hint: true },
  pending_payment: { tone: "batta-tone-warn", hint: true },
  pending_review:  { tone: "batta-tone-warn", hint: true },
  published:       { tone: "batta-tone-ok" },
  rejected:        { tone: "batta-tone-bad" },
  expired:         { tone: "bg-surface-2 text-muted ring-1 ring-border", hint: true },
  sold:            { tone: "batta-tone-ok" },
  archived:        { tone: "bg-surface-2 text-muted ring-1 ring-border" },
  paused:          { tone: "batta-tone-warn", hint: true },
};

/**
 * The tabs. `key` is what appears in the URL — French and readable, because a
 * seller who bookmarks "mes annonces à corriger" should not be looking at
 * `?statut=action_required`.
 */
const TABS = [
  { key: "",             label: "all",    statuses: null,                                   tone: "text-foreground" },
  { key: "en-ligne",     label: "live",   statuses: ["published"],                          tone: "text-emerald-400" },
  { key: "verification", label: "review", statuses: ["pending_payment", "pending_review"],  tone: "text-amber-400" },
  { key: "a-corriger",   label: "fix",    statuses: ["rejected", "draft"],                  tone: "text-[var(--danger)]" },
  { key: "terminees",    label: "done",   statuses: ["expired", "archived", "sold", "paused"], tone: "text-muted" },
] as const;

const RENEWABLE = ["expired", "archived", "sold"];

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; payment?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("myAccount");
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/listings`)}`);
  }

  const admin = getServiceSupabase();
  const db = admin ?? supabase;

  const [listRes, creditRes, prodRes, catRes, limitsRes, payRes] = await Promise.all([
    db
      .from("listings")
      .select(
        `id, title, price, price_on_request, status, rejection_reason, published_at,
         expires_at, created_at, category_id, shop_id, category:categories (slug, label_fr, label_ar),
         photos:listing_photos (storage_path, sort_order, is_cover)`,
      )
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("seller_credits")
      .select("quota_total, quota_used, expires_at, status")
      .eq("seller_id", user.id)
      .eq("status", "active"),
    db.from("products").select(PRODUCT_SELECT).eq("is_active", true),
    db.from("categories").select("id, parent_id"),
    // personal_limits.free (D-P1, 0189): while on, a personal renewal is free.
    db.from("app_settings").select("value").eq("key", "personal_limits").maybeSingle(),
    // The open fee payment per listing, so "À payer" can be paid from this
    // page instead of only from the notification that announced it.
    //
    // The link is metadata.listing_id, NOT property_id: `payments.property_id`
    // is a foreign key to the auction-era `properties` table and cannot hold a
    // listing id at all. Matching on it would have compiled, run, and silently
    // never found a payment.
    db
      .from("payments")
      .select("id, metadata, status")
      .eq("user_id", user.id)
      .eq("kind", "listing_fee")
      .in("status", ["pending", "pending_review"]),
  ]);

  const products: Product[] = (prodRes.data ?? []).map((r) =>
    toProduct(r as Parameters<typeof toProduct>[0]),
  );
  const renewalProduct = products.find((p) => p.kind === "renewal") ?? null;

  // Category → parent, so a price set on a parent (« Pièces de rechange » at 0)
  // resolves for its children the same way the API does it.
  const parentOf = new Map(
    (catRes.data ?? []).map((c) => [c.id as string, (c.parent_id as string | null) ?? null]),
  );

  const payFor = new Map<string, string>();
  for (const p of (payRes.data ?? []) as { id: string; metadata: unknown }[]) {
    const listingId = (p.metadata as { listing_id?: string } | null)?.listing_id;
    if (listingId && !payFor.has(listingId)) payFor.set(listingId, p.id);
  }

  const now = Date.now();
  const creditsLeft = (creditRes.data ?? []).reduce((n, c) => {
    if (new Date(c.expires_at as string).getTime() <= now) return n;
    return n + Math.max(0, (c.quota_total as number) - (c.quota_used as number));
  }, 0);

  type CategoryRow = { slug: string | null; label_fr: string; label_ar: string | null };
  type Row = {
    id: string; title: string; price: number | null; price_on_request: boolean;
    status: string; rejection_reason: string | null; published_at: string | null;
    expires_at: string | null; created_at: string;
    category: CategoryRow | CategoryRow[] | null;
    category_id: string;
    shop_id: string | null;
    photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
  };
  const all = (listRes.data ?? []) as Row[];

  const active = TABS.find((t) => t.key === (sp.statut ?? "")) ?? TABS[0];
  const countFor = (statuses: readonly string[] | null) =>
    statuses === null ? all.length : all.filter((r) => statuses.includes(r.status)).length;
  const rows =
    active.statuses === null
      ? all
      : all.filter((r) => (active.statuses as readonly string[]).includes(r.status));

  // What renewing costs. Mirrors the renew route exactly, including its
  // exception: a category that publishes for free renews for free, so a part
  // is never quoted 15 TND.
  const personalFree =
    (limitsRes.data?.value as { free?: boolean } | null | undefined)?.free !== false;
  const renewLabel = (l: Row): string | null => {
    // What the renew route will actually do (src/lib/publication.ts): a shop
    // annonce is covered by its subscription, a personal one is free while
    // the D-P1 switch is on. Only otherwise does a product price apply.
    if (l.shop_id) return t("listings.renewFee.included");
    if (personalFree) return t("listings.renewFee.free");
    const categoryFee = resolveListingFee(products, l.category_id, parentOf.get(l.category_id) ?? null);
    const p = isFree(categoryFee) ? categoryFee : renewalProduct ?? categoryFee;
    if (!p) return null;
    return p.price <= 0 ? t("listings.renewFee.free") : `${formatTND(p.price, locale)} ${currencyLabel(locale)}`;
  };

  const priceOf = (l: Row) =>
    l.price_on_request || l.price == null
      ? t("common.onRequest")
      : `${formatTND(Number(l.price), locale)} ${currencyLabel(locale)}`;

  const date = (v: string | null) =>
    v ? formatDate(v, locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const statusOf = (status: string) => {
    const s = STATUS[status];
    if (!s) return { label: status, tone: "bg-surface-2 text-muted", hint: null };
    return {
      label: t(`listings.status.${status}.label`),
      tone: s.tone,
      hint: s.hint ? t(`listings.status.${status}.hint`) : null,
    };
  };

  /** Days left before a published annonce expires — the only date that is urgent. */
  const daysLeft = (l: Row) => {
    if (l.status !== "published" || !l.expires_at) return null;
    return Math.ceil((new Date(l.expires_at).getTime() - now) / 86_400_000);
  };

  /**
   * The one action a row implies. Every branch points at a route that exists:
   * resuming a draft relies on /annonces/nouvelle loading the seller's own
   * draft, which is what it already does.
   */
  function Action({ l, block = false }: { l: Row; block?: boolean }) {
    const cls = block
      ? "batta-btn-luxe tap-target mt-2.5 flex w-full justify-center px-3 py-2.5 text-[12.5px]"
      : "batta-btn-luxe tap-target inline-flex px-3 py-1.5 text-[12px]";

    if (l.status === "pending_payment" && payFor.has(l.id)) {
      return (
        <Link href={`/payment/checkout?payment=${payFor.get(l.id)}` as never} className={cls}>
          <CreditCard className="size-3.5" /> {t("listings.pay")}
        </Link>
      );
    }
    if (l.status === "draft") {
      return (
        <Link href={"/annonces/nouvelle" as never} className={cls}>
          <PencilLine className="size-3.5" /> {t("listings.resume")}
        </Link>
      );
    }
    if (RENEWABLE.includes(l.status)) {
      return <RenewButton listingId={l.id} usesCredit={creditsLeft > 0 && !l.shop_id && !personalFree} feeLabel={renewLabel(l)} />;
    }
    const view = (
      <Link
        href={`/annonces/${l.id}` as never}
        className={
          block
            ? "mt-2.5 flex w-full items-center justify-center gap-1 rounded-xl border border-border px-3 py-2.5 text-[12.5px] font-bold text-foreground hover:border-gold-soft hover:text-gold"
            : "inline-flex items-center gap-1 text-[12.5px] font-bold text-gold hover:underline"
        }
      >
        {t("listings.view")} <ArrowRight className="size-3.5 rtl:-scale-x-100" />
      </Link>
    );
    // Live or in review: the seller can take it down — and free its place.
    if (l.status === "published" || l.status === "pending_review") {
      return (
        <div className={block ? "space-y-2" : "flex flex-wrap items-center gap-3"}>
          {view}
          <WithdrawButton listingId={l.id} title={l.title} />
        </div>
      );
    }
    return view;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:max-w-6xl lg:px-8 lg:py-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight lg:text-[32px]">{t("listings.title")}</h1>
          <p className="mt-1 text-[13px] text-muted lg:text-[14px]">
            {all.length === 0
              ? t("listings.none")
              : t("listings.count", { count: all.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {creditsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
              <Ticket className="size-4" />
              {t("listings.creditsLeft", { count: creditsLeft })}
            </span>
          )}
          <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]">
            <Plus className="size-4" /> {t("listings.publish")}
          </Link>
        </div>
      </div>

      {sp.payment && /^[0-9a-f-]{36}$/i.test(sp.payment) && (
        <div className="mt-4"><PaymentStatus paymentId={sp.payment} /></div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────
          The count and the filter are one control. On a phone they scroll
          sideways instead of wrapping into three ragged rows. */}
      {all.length > 0 && (
        <nav className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
          <div className="flex min-w-max gap-2 lg:min-w-0">
            {TABS.map((tab) => {
              const n = countFor(tab.statuses);
              const on = tab.key === active.key;
              // An empty tab is noise — unless you are standing in it, in which
              // case removing it would strand you.
              if (n === 0 && !on && tab.key !== "") return null;
              return (
                <Link
                  key={tab.key || "all"}
                  href={(tab.key ? `/account/listings?statut=${tab.key}` : "/account/listings") as never}
                  aria-current={on ? "page" : undefined}
                  className={[
                    "tap-target flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-bold transition",
                    on
                      ? "border-gold-soft bg-gold-faint text-gold"
                      : "border-border bg-surface text-muted hover:border-gold-soft hover:text-foreground",
                  ].join(" ")}
                >
                  {t(`listings.tabs.${tab.label}`)}
                  <span className={`batta-tabular text-[13px] font-extrabold ${on ? "text-gold" : tab.tone}`}>
                    {n}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── PHONE · one card per annonce ───────────────────────────────── */}
      <div className="mt-4 space-y-3 lg:hidden">
        {rows.map((l) => {
          const st = statusOf(l.status);
          const cat = Array.isArray(l.category) ? l.category[0] : l.category;
          const cover = coverPhoto(l.photos);
          const left = daysLeft(l);
          return (
            <article key={l.id} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex gap-3">
                <Link
                  href={`/annonces/${l.id}` as never}
                  className="relative size-[74px] shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                >
                  {cover ? (
                    <ListingImage path={cover.storage_path} alt="" sizes="74px" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                      {st.label}
                    </span>
                    <span className="truncate text-[11px] text-muted">{cat ? categoryLabel(cat, locale) : "—"}</span>
                  </div>
                  <Link href={`/annonces/${l.id}` as never} className="mt-1 block truncate text-[14.5px] font-bold text-foreground">
                    {l.title}
                  </Link>
                  <p className="batta-tabular mt-0.5 text-[14px] font-extrabold text-gold">{priceOf(l)}</p>
                </div>
              </div>

              {l.rejection_reason ? (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[var(--accent-faint)] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-[var(--accent-deep)]">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  <span>{l.rejection_reason}</span>
                </p>
              ) : st.hint ? (
                <p className="mt-2.5 text-[11.5px] text-muted">{st.hint}</p>
              ) : null}

              {left !== null && (
                <p className={`mt-2 inline-flex items-center gap-1 text-[11.5px] ${left <= 3 ? "font-bold text-amber-400" : "text-muted"}`}>
                  <Clock className="size-3" />
                  {left <= 0 ? t("listings.expiresToday") : t("listings.daysLeft", { count: left })}
                </p>
              )}

              <Action l={l} block />
            </article>
          );
        })}
      </div>

      {/* ── DESKTOP · a management table ────────────────────────────────────
          At this width the seller compares rows — status, price, dates — so
          they get columns and aligned numbers rather than a ribbon of cards
          with an ocean of empty space beside it. */}
      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-5 py-3.5 text-start font-extrabold">{t("listings.columns.listing")}</th>
              <th className="px-3 py-3.5 text-start font-extrabold">{t("listings.columns.status")}</th>
              <th className="px-3 py-3.5 text-end font-extrabold">{t("listings.columns.price")}</th>
              <th className="px-3 py-3.5 text-start font-extrabold">{t("listings.columns.published")}</th>
              <th className="px-3 py-3.5 text-start font-extrabold">{t("listings.columns.expires")}</th>
              <th className="px-5 py-3.5 text-end font-extrabold">{t("listings.columns.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((l) => {
              const st = statusOf(l.status);
              const cat = Array.isArray(l.category) ? l.category[0] : l.category;
              const cover = coverPhoto(l.photos);
              const left = daysLeft(l);
              return (
                <tr key={l.id} className="align-middle transition hover:bg-surface-2/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3.5">
                      <Link
                        href={`/annonces/${l.id}` as never}
                        className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                      >
                        {cover ? (
                          <ListingImage path={cover.storage_path} alt="" sizes="56px" />
                        ) : (
                          <span className="grid size-full place-items-center text-muted"><ImageOff className="size-4" /></span>
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/annonces/${l.id}` as never}
                          className="block max-w-[34ch] truncate text-[14px] font-bold text-foreground hover:text-gold"
                        >
                          {l.title}
                        </Link>
                        <div className="truncate text-[11.5px] text-muted">{cat ? categoryLabel(cat, locale) : "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                      {st.label}
                    </span>
                    {l.rejection_reason ? (
                      <div className="mt-1 max-w-[26ch] truncate text-[11px] text-[var(--accent-deep)]" title={l.rejection_reason}>
                        {l.rejection_reason}
                      </div>
                    ) : st.hint ? (
                      <div className="mt-1 max-w-[26ch] text-[11px] leading-snug text-muted">{st.hint}</div>
                    ) : null}
                  </td>
                  <td className="batta-tabular whitespace-nowrap px-3 py-3.5 text-end font-extrabold text-gold">
                    {priceOf(l)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-[12.5px] text-muted">{date(l.published_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-[12.5px]">
                    {left === null ? (
                      <span className="text-muted">{l.status === "published" ? "—" : date(l.expires_at)}</span>
                    ) : (
                      <span className={left <= 3 ? "font-bold text-amber-400" : "text-muted"}>
                        {date(l.expires_at)}
                        <span className="block text-[11px]">
                          {left <= 0 ? t("listings.today") : t("listings.inDays", { count: left })}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-end"><Action l={l} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Empty ──────────────────────────────────────────────────────────
          Distinguishes "you have nothing" from "this tab has nothing" — two
          different problems with two different ways out. */}
      {rows.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center lg:p-14">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface text-muted">
            <Inbox className="size-6" />
          </span>
          {all.length === 0 ? (
            <>
              <p className="mt-4 text-[15px] font-bold text-foreground">{t("listings.emptyTitle")}</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                {t("listings.emptyBody")}
              </p>
              <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target mt-5 inline-flex px-5 py-2.5 text-[13px]">
                <Plus className="size-4" /> {t("listings.emptyCta")}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-[15px] font-bold text-foreground">{t("listings.emptyTabTitle", { tab: t(`listings.tabs.${active.label}`) })}</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                {t("listings.emptyTabBody")}
              </p>
              <Link
                href={"/account/listings" as never}
                className="mt-5 inline-flex items-center gap-1 text-[13px] font-bold text-gold hover:underline"
              >
                {t("listings.seeAll")} <ArrowRight className="size-3.5 rtl:-scale-x-100" />
              </Link>
            </>
          )}
        </div>
      )}
    </main>
  );
}
