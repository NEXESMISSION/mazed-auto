import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/dates";
import { governorateLabel } from "@/lib/labels";
import { currencyLabel, formatTND } from "@/lib/utils";
import { productName } from "@/lib/products";
import { AdminPager } from "@/components/admin/AdminPager";
import { FullBleed, Toolbar, EmptyState, QueueKeys, StatusPill, type Tab } from "@/components/admin/kit";
import { ROW_BASE, ROW_IDLE, ROW_SELECTED, ROW_FOCUS } from "@/components/admin/kit/surface";
import { RequestDetail, type RequestDetailData } from "./RequestDetail";
import { ClipboardCheck } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Demandes — what shops ask the back office before they may pay (0196): an
 * opening, a change of plan, a renewal or a boost, whichever the settings say
 * need an approval. Each answer goes through /api/admin/demandes/[id], on the
 * admin's own session, and lands in audit_logs; the seller is told.
 *
 * The queue is « À décider ». Accepted requests wait for their payment, which
 * arrives through Paiements like any other.
 */

const PAGE_SIZE = 30;
type TabKey = "pending" | "approved" | "done" | "closed" | "all";
const TAB_ORDER: TabKey[] = ["pending", "approved", "done", "closed", "all"];
const TAB_STATUSES: Record<TabKey, string[] | null> = {
  pending: ["pending"],
  approved: ["approved"],
  done: ["completed"],
  closed: ["rejected", "cancelled"],
  all: null,
};

type Admin = NonNullable<ReturnType<typeof getServiceSupabase>>;
type T = Awaited<ReturnType<typeof getTranslations>>;

const REQUEST_SELECT =
  "id, kind, status, reason, created_at, decided_at, decided_by, listing_id, payment_id, requested_by, " +
  "shop:shops (id, name, slug, activity_type, governorate, status, verification_status, created_at, owner_id), " +
  "product:products (id, name_fr, name_ar, price, plan_code, limits, duration_days)";

type ProductRow = {
  id: string; name_fr: string; name_ar: string | null; price: number | string; plan_code: string | null;
  limits: { vehicles: number; parts: number } | null; duration_days: number | null;
};
type ShopRow = {
  id: string; name: string; slug: string; activity_type: string; governorate: string; status: string;
  verification_status: string; created_at: string; owner_id: string;
};
type RequestRow = {
  id: string; kind: string; status: string; reason: string | null; created_at: string; decided_at: string | null;
  decided_by: string | null; listing_id: string | null; payment_id: string | null; requested_by: string;
  shop: ShopRow | ShopRow[] | null; product: ProductRow | ProductRow[] | null;
};

const one = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? v[0] ?? null : v);
const KINDS = ["opening", "plan_change", "renewal", "boost"];
const ACTIVITIES = ["vente_auto", "location_auto", "pieces_auto"];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; a?: string }>;
}) {
  const sp = await searchParams;
  const admin = getServiceSupabase();
  const t = await getTranslations("adminOps");
  const locale = await getLocale();
  if (!admin) return <p className="text-[13px] text-muted">{t("common.noService")}</p>;

  const tab: TabKey = TAB_ORDER.includes(sp.status as TabKey) ? (sp.status as TabKey) : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const scoped = (k: TabKey, head = false) => {
    let query = admin.from("pro_requests").select(head ? "id" : REQUEST_SELECT, head ? { count: "exact", head: true } : { count: "exact" });
    const statuses = TAB_STATUSES[k];
    if (statuses) query = query.in("status", statuses);
    return query;
  };
  // The queue is read oldest first — the one waiting longest is the next to answer.
  const list = scoped(tab).order("created_at", { ascending: tab === "pending" }).range(from, from + PAGE_SIZE - 1);
  const [listRes, ...countRes] = await Promise.all([list, ...TAB_ORDER.map((k) => scoped(k, true))]);
  const tabs: Tab[] = TAB_ORDER.map((k, i) => ({ value: k, label: t(`requests.tabs.${k}`), count: countRes[i].count ?? 0 }));

  const rows = (listRes.data ?? []) as unknown as RequestRow[];
  const totalPages = Math.max(1, Math.ceil((listRes.count ?? 0) / PAGE_SIZE));

  const base = new URLSearchParams();
  if (sp.status) base.set("status", sp.status);
  if (sp.page) base.set("page", sp.page);
  const hrefBase = `/admin/demandes?${base.toString()}${base.toString() ? "&" : ""}`;
  const listHref = `/admin/demandes${base.toString() ? `?${base.toString()}` : ""}`;

  const openId = sp.a && /^[0-9a-f-]{36}$/i.test(sp.a) ? sp.a : null;
  const detail = openId ? await loadRequest(admin, openId, t, locale) : null;
  const dt = (iso: string) => formatDate(iso, locale, { day: "2-digit", month: "short" });
  const kindLabel = (k: string) => (KINDS.includes(k) ? t(`requests.kind.${k}`) : k);

  return (
    <FullBleed>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-4">
        <h1 className="shrink-0 text-[13px] font-semibold tracking-tight text-foreground">{t("requests.title")}</h1>
        <Toolbar tabs={tabs} defaultTab="pending" search={false} resetParams={["page", "a"]} />
      </header>

      <QueueKeys />

      <div className="flex min-h-0 flex-1">
        <div className={`flex min-h-0 w-full flex-col border-border lg:w-[360px] lg:shrink-0 lg:border-e xl:w-[400px] ${detail ? "hidden lg:flex" : "flex"}`}>
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                Icon={ClipboardCheck}
                tone="idle"
                title={t("common.emptyTab", { tab: t(`requests.tabs.${tab}`) })}
                hint={tab === "pending" ? t("requests.emptyHint") : undefined}
              />
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto overscroll-contain">
              {rows.map((r) => {
                const shop = one(r.shop);
                const product = one(r.product);
                const selected = r.id === openId;
                return (
                  <li key={r.id}>
                    <Link
                      href={`${hrefBase}a=${r.id}` as "/admin/demandes"}
                      data-row-id={r.id}
                      aria-current={selected ? "true" : undefined}
                      prefetch={false}
                      className={`${ROW_BASE} ${ROW_FOCUS} ${selected ? ROW_SELECTED : ROW_IDLE}`}
                    >
                      <span className="mt-[6px] shrink-0">
                        <StatusPill status={r.status} dotOnly />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${selected ? "font-semibold text-foreground" : "font-medium text-foreground/90"}`}>
                          {shop?.name ?? "—"}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-subtle">
                          {kindLabel(r.kind)} · {product ? productName({ nameFr: product.name_fr, nameAr: product.name_ar }, locale) : "—"}
                          {product && <> · <span className="batta-tabular">{formatTND(Number(product.price), locale)} {currencyLabel(locale)}</span></>}
                        </span>
                      </span>
                      <span className="shrink-0 text-end text-[11.5px] text-subtle">{dt(r.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="shrink-0 border-t border-border px-4 py-2">
              <AdminPager page={page} totalPages={totalPages} />
            </div>
          )}
        </div>

        <div className={`min-w-0 flex-1 ${detail ? "flex" : "hidden lg:flex"}`}>
          {detail ? (
            <div className="w-full">
              <RequestDetail request={detail} backHref={listHref} />
            </div>
          ) : (
            <div className="grid w-full place-items-center px-6">
              <p className="max-w-sm text-center text-[12.5px] text-subtle">{t("requests.pick")}</p>
            </div>
          )}
        </div>
      </div>
    </FullBleed>
  );
}

// ── One request, with what an admin needs to answer it ─────────────────────

async function loadRequest(admin: Admin, id: string, t: T, locale: string): Promise<RequestDetailData | null> {
  const { data } = await admin.from("pro_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  const r = data as unknown as RequestRow | null;
  const shop = r ? one(r.shop) : null;
  const product = r ? one(r.product) : null;
  if (!r || !shop || !product) return null;

  const nowIso = new Date().toISOString();
  const people = [...new Set([r.requested_by, shop.owner_id, r.decided_by].filter((x): x is string => !!x))];
  const [peopleRes, docsRes, periodRes, historyRes, paysRes, listingRes, privRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, phone, role").in("id", people),
    admin.from("shop_documents").select("status").eq("shop_id", shop.id),
    admin
      .from("subscriptions")
      .select("ends_at, status, product:products!subscriptions_product_id_fkey (name_fr, name_ar)")
      .eq("shop_id", shop.id)
      .neq("status", "cancelled")
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("pro_requests")
      .select("id, kind, status, reason, created_at, product:products (name_fr, name_ar)")
      .eq("shop_id", shop.id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("payments")
      .select("id, amount, status, provider, created_at")
      .eq("metadata->>request_id", id)
      .order("created_at", { ascending: false }),
    r.listing_id
      ? admin.from("listings").select("id, title, status").eq("id", r.listing_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("shop_private").select("legal_name, tax_id, rne_number").eq("shop_id", shop.id).maybeSingle(),
  ]);

  const who = new Map((peopleRes.data ?? []).map((p) => [p.id as string, p]));
  const person = (pid: string | null) => {
    const p = pid ? who.get(pid) : null;
    return p ? { name: (p.full_name as string | null) ?? t("common.noName"), phone: (p.phone as string | null) ?? null } : null;
  };
  const docs: Record<string, number> = {};
  for (const d of docsRes.data ?? []) docs[d.status as string] = (docs[d.status as string] ?? 0) + 1;
  type Named = { name_fr: string; name_ar: string | null };
  const named = (p: Named | Named[] | null) => {
    const x = one(p);
    return x ? productName({ nameFr: x.name_fr, nameAr: x.name_ar }, locale) : "—";
  };
  const period = periodRes.data as { ends_at: string; status: string; product: Named | Named[] | null } | null;
  const listing = listingRes.data as { id: string; title: string; status: string } | null;
  const priv = privRes.data as { legal_name: string | null; tax_id: string | null; rne_number: string | null } | null;

  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedBy: person(r.decided_by)?.name ?? null,
    product: {
      name: productName({ nameFr: product.name_fr, nameAr: product.name_ar }, locale),
      price: Number(product.price),
      days: product.duration_days,
      limit: product.limits
        ? shop.activity_type === "pieces_auto" ? { n: product.limits.parts, bucket: "parts" } : { n: product.limits.vehicles, bucket: "vehicles" }
        : null,
    },
    listing: listing ? { id: listing.id, title: listing.title, status: listing.status } : null,
    shop: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      activity: ACTIVITIES.includes(shop.activity_type) ? t(`shops.activity.${shop.activity_type}`) : shop.activity_type,
      place: governorateLabel(shop.governorate, locale),
      status: shop.status,
      verification: shop.verification_status,
      createdAt: shop.created_at,
      legal: priv && (priv.legal_name || priv.tax_id || priv.rne_number)
        ? [priv.legal_name, priv.tax_id, priv.rne_number].filter(Boolean).join(" · ")
        : null,
      documents: docs,
      period: period ? { plan: named(period.product), endsAt: period.ends_at } : null,
    },
    requester: person(r.requested_by),
    owner: shop.owner_id !== r.requested_by ? person(shop.owner_id) : null,
    ownerId: shop.owner_id,
    payments: (paysRes.data ?? []).map((p) => ({
      id: p.id as string, amount: Number(p.amount), status: p.status as string,
      provider: p.provider as string, createdAt: p.created_at as string,
    })),
    history: (historyRes.data ?? []).map((h) => ({
      id: h.id as string, kind: h.kind as string, status: h.status as string, reason: (h.reason as string | null) ?? null,
      createdAt: h.created_at as string, product: named(h.product as Named | Named[] | null),
    })),
  };
}
