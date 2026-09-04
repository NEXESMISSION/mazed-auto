import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader, EmptyState, DataTable, Stacked, type Row } from "@/components/admin/kit";
import {
  Inbox, Receipt, CalendarClock, AlertTriangle, ArrowUpRight,
  CheckCircle2, Activity, Hourglass,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The triage dashboard — what is waiting on a decision, right now.
 *
 * The previous version counted six queues, five of which read tables that
 * hold zero rows (properties, auction payments, auction_deposits,
 * seller_payouts) and one — KYC — that linked to a page deleted in Phase 6a,
 * so it rendered a live-looking "2" pointing at a 404. A dashboard whose
 * numbers cannot move is worse than no dashboard: it trains you to ignore it.
 *
 * Every tile here is backed by a table with rows in it, and every number is a
 * head-only COUNT — nothing on this page fetches a list except the eight-row
 * audit strip at the bottom.
 */

const OVERDUE_MS = 48 * 3_600_000;
const EXPIRING_MS = 7 * 24 * 3_600_000;

export default async function AdminDashboard() {
  const sb = await getServerSupabase();

  const now = Date.now();
  const overdue = new Date(now - OVERDUE_MS).toISOString();
  const soon = new Date(now + EXPIRING_MS).toISOString();
  const nowIso = new Date().toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = dayStart.toISOString();

  const head = (t: string) => sb.from(t).select("*", { count: "exact", head: true });

  const [
    listingsPending, listingsOverdue, listingsToday,
    paymentsPending, paymentsOverdue,
    expiringSoon, expired,
    recent,
  ] = await Promise.all([
    head("listings").eq("status", "pending_review"),
    head("listings").eq("status", "pending_review").lt("created_at", overdue),
    head("listings").eq("status", "published").gte("published_at", today),
    head("payments").eq("status", "pending_review"),
    head("payments").eq("status", "pending_review").lt("created_at", overdue),
    head("listings").eq("status", "published").not("expires_at", "is", null)
      .gte("expires_at", nowIso).lte("expires_at", soon),
    head("listings").eq("status", "expired"),
    // The audit strip. `action is not null` is what separates a real decision
    // from page-view telemetry — 16 836 of the 17 034 rows in this table are
    // the latter, which is why the journal is unreadable without this filter.
    sb.from("activity_log")
      .select("id, created_at, action, user_email")
      .not("action", "is", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  const tiles = [
    {
      label: "Annonces à valider",
      sub: "Soumises par un vendeur",
      href: "/admin/annonces?status=pending_review",
      Icon: Inbox,
      count: n(listingsPending),
      overdue: n(listingsOverdue),
    },
    {
      label: "Reçus à valider",
      sub: "Publication, packs, mises en avant",
      href: "/admin/payments",
      Icon: Receipt,
      count: n(paymentsPending),
      overdue: n(paymentsOverdue),
    },
    {
      label: "Expirent sous 7 jours",
      sub: "À relancer pour un renouvellement",
      href: "/admin/annonces?status=published",
      Icon: Hourglass,
      count: n(expiringSoon),
      overdue: 0,
    },
    {
      label: "Expirées",
      sub: "Hors ligne, renouvelables",
      href: "/admin/annonces?status=expired",
      Icon: CalendarClock,
      count: n(expired),
      overdue: 0,
    },
  ];

  const totalPending = n(listingsPending) + n(paymentsPending);
  const totalOverdue = n(listingsOverdue) + n(paymentsOverdue);

  const recentRows: Row[] = (recent.data ?? []).map((r) => ({
    id: r.id as string,
    cells: {
      when: (
        <span className="batta-tabular text-[12px] text-muted">
          {relative(r.created_at as string)}
        </span>
      ),
      what: (
        <Stacked
          top={actionLabel(r.action as string)}
          bottom={(r.user_email as string | null) ?? "—"}
        />
      ),
    },
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Console"
        title="Tableau de bord"
        description="Tout ce qui attend une décision, par file. Chaque carte ouvre la file déjà filtrée."
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="En attente" value={totalPending} tone="brand" Icon={Hourglass} />
        <Kpi
          label="En retard (> 48 h)"
          value={totalOverdue}
          tone={totalOverdue > 0 ? "danger" : "muted"}
          Icon={AlertTriangle}
        />
        <Kpi label="Publiées aujourd'hui" value={n(listingsToday)} tone="ok" Icon={CheckCircle2} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href as "/admin/annonces"}
            className="group rounded-xl border border-border bg-surface p-4 transition hover:border-[var(--gold-soft)] hover:bg-surface-2"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-muted transition group-hover:text-gold">
                <t.Icon className="size-4" strokeWidth={2} />
              </span>
              <ArrowUpRight
                className="size-4 text-subtle transition group-hover:text-gold"
                strokeWidth={2}
              />
            </div>
            <div
              className={`batta-tabular mt-3 text-[30px] font-extrabold leading-none ${
                t.count > 0 ? "text-foreground" : "text-subtle"
              }`}
            >
              {t.count}
            </div>
            <div className="mt-1.5 text-[13px] font-bold leading-tight text-foreground">
              {t.label}
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted">{t.sub}</div>
            {t.overdue > 0 && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[rgba(239,68,68,0.12)] px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#ef8681] ring-1 ring-[rgba(239,68,68,0.3)]">
                <AlertTriangle className="size-3" strokeWidth={2.4} />
                {t.overdue} en retard
              </div>
            )}
          </Link>
        ))}
      </div>

      <section className="mt-9">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-extrabold tracking-tight text-foreground">
            Derniers gestes
          </h2>
          <Link
            href={"/admin/activity" as "/admin"}
            className="text-[12px] font-semibold text-muted transition hover:text-gold"
          >
            Tout le journal →
          </Link>
        </div>
        <DataTable
          caption="Dernières actions enregistrées"
          columns={[
            { key: "when", label: "Quand", width: "110px" },
            { key: "what", label: "Geste" },
          ]}
          rows={recentRows}
          empty={
            <EmptyState
              Icon={Activity}
              title="Aucune action enregistrée"
              hint="Les validations, refus et modifications apparaîtront ici."
            />
          }
        />
      </section>
    </div>
  );
}

function Kpi({
  label, value, tone, Icon,
}: {
  label: string;
  value: number;
  tone: "brand" | "danger" | "ok" | "muted";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const numClass =
    tone === "danger"
      ? "text-[#ef8681]"
      : tone === "brand"
        ? "text-gold"
        : tone === "ok"
          ? "text-[#5cc98a]"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
        <Icon className="size-3.5" strokeWidth={2.2} />
        {label}
      </div>
      <div className={`batta-tabular mt-2 text-[32px] font-extrabold leading-none ${numClass}`}>
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

/** "il y a 4 min" / "il y a 3 h" / "il y a 2 j" — short enough for a column. */
function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/**
 * Action codes in the operator's words. Unmapped codes fall through to the
 * raw value on purpose — a new action showing up as `listing.foo` is a
 * prompt to label it, whereas hiding it makes the journal quietly incomplete.
 */
const ACTION_LABEL: Record<string, string> = {
  "listing.create": "Annonce créée",
  "listing.submit.free": "Annonce soumise (gratuite)",
  "listing.submit.payment": "Annonce soumise (payante)",
  "listing.renew": "Annonce renouvelée",
  "admin.listing.approve": "Annonce publiée",
  "admin.listing.reject": "Annonce refusée",
  "admin.listing.archive": "Annonce archivée",
  "admin.listing.mark_paid": "Paiement enregistré",
  "admin.listing.waive_fee": "Publication offerte",
  "admin.listing.create": "Annonce créée par l'admin",
  "payment.captured": "Paiement validé",
  "payment.failed": "Paiement refusé",
  "payment.manual": "Paiement manuel enregistré",
  "user.admin_update": "Compte modifié",
  "home.feature": "Mise en avant sur l'accueil",
  logout: "Déconnexion",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}
