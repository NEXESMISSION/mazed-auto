import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { AdminPager } from "@/components/admin/AdminPager";
import { FullBleed, Toolbar, EmptyState, QueueKeys, StatusPill, EYEBROW, type Tab } from "@/components/admin/kit";
import { ROW_BASE, ROW_IDLE, ROW_SELECTED, ROW_FOCUS } from "@/components/admin/kit/surface";
import { ACTIVITY_LABEL } from "@/lib/shops/format";
import { ShopDetail, type ShopDetailData } from "./ShopDetail";
import { AlertTriangle, BadgeCheck, Store } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Boutiques — the verification queue, every shop's papers and periods, and the
 * payments that need a human (plan §10). Each decision goes through
 * /api/admin/boutiques/[id], on the admin's own session, and lands in
 * audit_logs.
 *
 * Works whether or not shop pages are public (`pro_shops`): this is where an
 * admin prepares them.
 */

const PAGE_SIZE = 30;
type TabKey = "todo" | "active" | "stopped" | "all";
const TAB_LABEL: Record<TabKey, string> = { todo: "À traiter", active: "Actives", stopped: "Suspendues", all: "Toutes" };
const TAB_ORDER: TabKey[] = ["todo", "active", "stopped", "all"];
const TODO_FILTER = "verification_status.eq.pending,status.eq.pending_review";

type Admin = NonNullable<ReturnType<typeof getServiceSupabase>>;

export default async function AdminBoutiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; a?: string }>;
}) {
  const sp = await searchParams;
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-[13px] text-muted">Service non configuré.</p>;

  const tab: TabKey = TAB_ORDER.includes(sp.status as TabKey) ? (sp.status as TabKey) : "todo";
  const q = (sp.q ?? "").trim().slice(0, 60).replace(/[,()*%]/g, " ").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const scoped = (t: TabKey, head = false) => {
    let query = admin
      .from("shops")
      .select("id, name, slug, activity_type, governorate, status, verification_status, created_at", head ? { count: "exact", head: true } : { count: "exact" });
    if (t === "todo") query = query.or(TODO_FILTER);
    if (t === "active") query = query.eq("status", "active");
    if (t === "stopped") query = query.in("status", ["suspended", "rejected", "closed"]);
    return query;
  };

  let list = scoped(tab).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (q) list = list.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);

  const [listRes, ...countRes] = await Promise.all([list, ...TAB_ORDER.map((t) => scoped(t, true))]);
  const tabs: Tab[] = TAB_ORDER.map((t, i) => ({ value: t, label: TAB_LABEL[t], count: countRes[i].count ?? 0 }));

  type ShopRow = {
    id: string; name: string; slug: string; activity_type: string; governorate: string;
    status: string; verification_status: string; created_at: string;
  };
  const rows = (listRes.data ?? []) as ShopRow[];
  const totalPages = Math.max(1, Math.ceil((listRes.count ?? 0) / PAGE_SIZE));

  const base = new URLSearchParams();
  if (sp.status) base.set("status", sp.status);
  if (sp.q) base.set("q", sp.q);
  if (sp.page) base.set("page", sp.page);
  const hrefBase = `/admin/boutiques?${base.toString()}${base.toString() ? "&" : ""}`;
  const listHref = `/admin/boutiques${base.toString() ? `?${base.toString()}` : ""}`;

  const openId = sp.a && /^[0-9a-f-]{36}$/i.test(sp.a) ? sp.a : null;
  const [detail, toReconcile] = await Promise.all([
    openId ? loadShop(admin, openId) : Promise.resolve(null),
    openId ? Promise.resolve(null) : loadToReconcile(admin),
  ]);

  return (
    <FullBleed>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-4">
        <h1 className="shrink-0 text-[13px] font-semibold tracking-tight text-foreground">Boutiques</h1>
        <Toolbar tabs={tabs} defaultTab="todo" searchPlaceholder="Nom ou adresse de la page…" resetParams={["page", "a"]} />
      </header>

      <QueueKeys />

      <div className="flex min-h-0 flex-1">
        <div className={`flex min-h-0 w-full flex-col border-border lg:w-[360px] lg:shrink-0 lg:border-e xl:w-[400px] ${detail ? "hidden lg:flex" : "flex"}`}>
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                Icon={Store}
                tone={q ? "filtered" : "idle"}
                title={q ? "Aucune boutique ne correspond" : `Rien dans « ${TAB_LABEL[tab]} »`}
                hint={q ? "Essayez un autre nom." : undefined}
              />
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto overscroll-contain">
              {rows.map((r) => {
                const selected = r.id === openId;
                return (
                  <li key={r.id}>
                    <Link
                      href={`${hrefBase}a=${r.id}` as "/admin/boutiques"}
                      data-row-id={r.id}
                      aria-current={selected ? "true" : undefined}
                      prefetch={false}
                      className={`${ROW_BASE} ${ROW_FOCUS} ${selected ? ROW_SELECTED : ROW_IDLE}`}
                    >
                      <span className="mt-[6px] shrink-0">
                        <StatusPill status={r.status} dotOnly />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-1.5 truncate text-[13px] ${selected ? "font-semibold text-foreground" : "font-medium text-foreground/90"}`}>
                          <span className="truncate">{r.name}</span>
                          {r.verification_status === "verified" && (
                            <BadgeCheck className="size-3 shrink-0 text-[var(--gold)]" strokeWidth={2.6} />
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-subtle">
                          {ACTIVITY_LABEL[r.activity_type as keyof typeof ACTIVITY_LABEL] ?? r.activity_type} · {r.governorate}
                        </span>
                      </span>
                      <span className="shrink-0 text-end text-[11.5px]">
                        {r.verification_status === "pending" ? (
                          <span className="text-[var(--tone-warn)]">à vérifier</span>
                        ) : (
                          <span className="text-subtle">{statusShort(r.status)}</span>
                        )}
                      </span>
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
              <ShopDetail shop={detail} backHref={listHref} />
            </div>
          ) : (
            <div className="w-full overflow-y-auto px-6 py-6">
              <ReconcilePanel items={toReconcile ?? []} />
            </div>
          )}
        </div>
      </div>
    </FullBleed>
  );
}

function statusShort(status: string): string {
  return ({ draft: "brouillon", pending_review: "à ouvrir", active: "active", rejected: "refusée", suspended: "suspendue", closed: "fermée" } as Record<string, string>)[status] ?? status;
}

// ── Payments that need a human ──────────────────────────────────────────────

type Reconcile = { id: string; amount: number; kind: string; label: string; why: string; at: string };

/**
 * Two kinds of trouble, both rare and both worth a look (plan §8.4):
 *   * Konnect said « completed » but the record did not match the order (amount,
 *     currency, order id) — the payment stayed pending and nothing opened;
 *   * a payment is captured but no period or boost came of it.
 * Fixing either is a decision (refund, capture by hand, give a period), made
 * from the payment or the shop, and recorded there.
 */
async function loadToReconcile(admin: Admin): Promise<Reconcile[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [mismatchRes, capturedRes] = await Promise.all([
    admin
      .from("payment_events")
      .select("payment_id, outcome, created_at, payment:payments (id, amount, kind, status)")
      .like("outcome", "mismatch:%")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("payments")
      .select("id, amount, kind, metadata, updated_at")
      .in("kind", ["subscription", "promo"])
      .eq("status", "captured")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const out: Reconcile[] = [];
  const seen = new Set<string>();
  type Ev = { payment_id: string; outcome: string; created_at: string; payment: { id: string; amount: number; kind: string; status: string } | { id: string; amount: number; kind: string; status: string }[] | null };
  for (const e of (mismatchRes.data ?? []) as unknown as Ev[]) {
    const p = Array.isArray(e.payment) ? e.payment[0] : e.payment;
    if (!p || p.status === "captured" || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      id: p.id, amount: Number(p.amount), kind: p.kind, at: e.created_at,
      label: p.kind === "subscription" ? "Abonnement" : "Boost",
      why: { "mismatch:amount": "montant inférieur à la commande", "mismatch:currency": "devise inattendue", "mismatch:order_id": "référence de commande différente", "mismatch:order_id_missing": "référence de commande absente" }[e.outcome] ?? e.outcome,
    });
  }

  const captured = (capturedRes.data ?? []) as { id: string; amount: number; kind: string; metadata: { product_slug?: string; listing_id?: string } | null; updated_at: string }[];
  const ids = captured.map((p) => p.id);
  if (ids.length) {
    const [{ data: subs }, { data: boosts }] = await Promise.all([
      admin.from("subscriptions").select("payment_id").in("payment_id", ids),
      admin.from("boosts").select("payment_id").in("payment_id", ids),
    ]);
    const granted = new Set([...(subs ?? []), ...(boosts ?? [])].map((r) => r.payment_id as string));
    for (const p of captured) {
      const isBoost = p.kind === "promo" && p.metadata?.product_slug === "boost-7j";
      if (p.kind === "promo" && !isBoost) continue;   // the old 30-day promos grant nothing here
      if (granted.has(p.id)) continue;
      out.push({
        id: p.id, amount: Number(p.amount), kind: p.kind, at: p.updated_at,
        label: p.kind === "subscription" ? "Abonnement" : "Boost",
        why: p.kind === "subscription" ? "payé, sans période ouverte" : "payé, sans boost",
      });
    }
  }
  return out;
}

function ReconcilePanel({ items }: { items: Reconcile[] }) {
  const dt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  return (
    <section className="mx-auto max-w-xl">
      <h2 className={EYEBROW}>Paiements à réconcilier · 90 jours</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-subtle">
          Rien à signaler : chaque paiement confirmé a ouvert sa période ou son boost, et aucun
          retour de Konnect n&apos;a contredit une commande. Choisissez une boutique à gauche.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70 rounded-xl border border-border">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/paiements?a=${r.id}` as "/admin/paiements"} className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-surface-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--tone-warn)]" />
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <span className="font-medium text-foreground">{r.label} · <span className="batta-tabular">{r.amount.toFixed(3)} TND</span></span>
                  <span className="block text-[11.5px] text-subtle">{r.why}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-subtle">{dt(r.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── One shop ────────────────────────────────────────────────────────────────

async function loadShop(admin: Admin, id: string): Promise<ShopDetailData | null> {
  const { data: s } = await admin
    .from("shops")
    .select("id, name, slug, activity_type, description, governorate, city, address, phone, whatsapp, status, verification_status, verified_at, rejection_reason, created_at, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;

  const [ownerRes, privRes, docsRes, subsRes, paysRes, listingsRes, plansRes, auditShop, auditDocs, auditListings] = await Promise.all([
    admin.from("profiles").select("full_name, phone").eq("id", s.owner_id).maybeSingle(),
    admin.from("shop_private").select("legal_name, tax_id, rne_number, legal_address, contact_email").eq("shop_id", id).maybeSingle(),
    admin.from("shop_documents").select("id, kind, status, note, created_at, reviewed_at").eq("shop_id", id).order("created_at", { ascending: false }),
    admin.from("subscriptions").select("id, starts_at, ends_at, grace_ends_at, status, reason, payment_id, product:products (name_fr)").eq("shop_id", id).order("starts_at", { ascending: false }).limit(12),
    admin.from("payments").select("id, kind, amount, status, provider, created_at, receipt_number").eq("shop_id", id).order("created_at", { ascending: false }).limit(12),
    admin.from("listings").select("status").eq("shop_id", id),
    admin.from("products").select("plan_code, name_fr, is_active").eq("kind", "subscription").not("plan_code", "is", null).order("sort_order"),
    admin.from("audit_logs").select("id, actor_id, entity, action, before, after, reason, created_at").eq("entity", "shop").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("audit_logs").select("id, actor_id, entity, action, before, after, reason, created_at").eq("entity", "shop_document").eq("after->>shop_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("audit_logs").select("id, actor_id, entity, action, before, after, reason, created_at").eq("entity", "listing").eq("after->>shop_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const subIds = (subsRes.data ?? []).map((r) => r.id as string);
  const { data: auditSubs } = subIds.length
    ? await admin.from("audit_logs").select("id, actor_id, entity, action, before, after, reason, created_at").eq("entity", "subscription").in("entity_id", subIds).order("created_at", { ascending: false }).limit(30)
    : { data: [] };

  type Audit = { id: string; actor_id: string | null; entity: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null; created_at: string };
  const audit = [...(auditShop.data ?? []), ...(auditDocs.data ?? []), ...(auditListings.data ?? []), ...(auditSubs ?? [])] as Audit[];
  audit.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const trail = audit.slice(0, 40);
  const actorIds = [...new Set(trail.map((a) => a.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id, full_name, role").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id as string, `${(a.full_name as string | null) ?? "Sans nom"}${a.role === "admin" ? " (admin)" : ""}`]));

  const counts: Record<string, number> = {};
  for (const l of listingsRes.data ?? []) counts[l.status as string] = (counts[l.status as string] ?? 0) + 1;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  return {
    id: s.id as string,
    name: s.name as string,
    slug: s.slug as string,
    activity: ACTIVITY_LABEL[s.activity_type as keyof typeof ACTIVITY_LABEL] ?? (s.activity_type as string),
    description: (s.description as string | null) ?? null,
    place: [s.address, s.city, s.governorate].filter(Boolean).join(", "),
    phone: (s.phone as string | null) ?? null,
    whatsapp: (s.whatsapp as string | null) ?? null,
    status: s.status as string,
    verification: s.verification_status as string,
    verifiedAt: (s.verified_at as string | null) ?? null,
    rejectionReason: (s.rejection_reason as string | null) ?? null,
    createdAt: s.created_at as string,
    owner: { id: s.owner_id as string, name: (ownerRes.data?.full_name as string | null) ?? "Sans nom", phone: (ownerRes.data?.phone as string | null) ?? null },
    legal: privRes.data
      ? {
          name: (privRes.data.legal_name as string | null) ?? null,
          taxId: (privRes.data.tax_id as string | null) ?? null,
          rne: (privRes.data.rne_number as string | null) ?? null,
          address: (privRes.data.legal_address as string | null) ?? null,
          email: (privRes.data.contact_email as string | null) ?? null,
        }
      : null,
    documents: (docsRes.data ?? []).map((d) => ({
      id: d.id as string, kind: d.kind as string, status: d.status as string,
      note: (d.note as string | null) ?? null, createdAt: d.created_at as string,
    })),
    periods: (subsRes.data ?? []).map((p) => ({
      id: p.id as string,
      plan: one(p.product as { name_fr: string } | { name_fr: string }[] | null)?.name_fr ?? "—",
      startsAt: p.starts_at as string, endsAt: p.ends_at as string, graceEndsAt: p.grace_ends_at as string,
      status: p.status as string,
      origin: p.payment_id ? "payée" : (p.reason as string | null) ?? "offerte",
    })),
    payments: (paysRes.data ?? []).map((p) => ({
      id: p.id as string, kind: p.kind as string, amount: Number(p.amount), status: p.status as string,
      provider: p.provider as string, createdAt: p.created_at as string, receipt: (p.receipt_number as string | null) ?? null,
    })),
    listings: counts,
    plans: (plansRes.data ?? []).map((p) => ({ code: p.plan_code as string, label: `${p.name_fr as string}${p.is_active ? "" : " (non vendue)"}` })),
    audit: trail.map((a) => ({
      id: a.id, at: a.created_at, entity: a.entity, action: a.action,
      actor: a.actor_id ? actorName.get(a.actor_id) ?? "Compte supprimé" : "Système",
      before: a.before, after: a.after, reason: a.reason,
    })),
  };
}
