import { Link } from "@/i18n/navigation";
import { Sparkles, TrendingUp, AlertTriangle, RotateCcw } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { SubscriptionsFilter } from "./SubscriptionsFilter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SubRow {
  subscription_id: string;
  user_id: string;
  user_label: string;
  user_email: string;
  plan_slug: string;
  plan_name: string;
  monthly_price: number;
  listings_per_month: number;
  listings_used_this_period: number;
  status: "active" | "past_due" | "cancelled" | "expired";
  started_at: string;
  current_period_end: string;
  expires_at: string | null;
  payment_provider: string | null;
}

interface SearchParams {
  plan?: string;
  include_inactive?: string;
  q?: string;
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { plan, include_inactive, q } = await searchParams;
  const includeInactive = include_inactive === "1";
  const searchTerm = (q ?? "").trim();
  const supabase = await createClient();

  const [{ data: rows }, { data: stats }, { data: plans }] = await Promise.all([
    supabase.rpc("admin_list_subscriptions", {
      p_plan_slug: plan ?? null,
      p_include_inactive: includeInactive,
      p_search: searchTerm || null,
      p_limit: 500,
    }),
    supabase.rpc("admin_subscription_stats").single(),
    supabase
      .from("cms_subscription_plans")
      .select("slug, name_fr")
      .order("position", { ascending: true }),
  ]);

  const subs = (rows ?? []) as SubRow[];
  const planOptions = (plans ?? []) as { slug: string; name_fr: string }[];
  const s = (stats ?? {}) as {
    active_count: number;
    mrr: number;
    expiring_within_7_days: number;
    cancelled_last_30_days: number;
  };

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--gold)]" />
            Abonnements
          </h1>
          <p className="text-xs text-[var(--foreground-muted)]">
            Vue d&apos;ensemble des abonnés Pro. Cliquez sur un nom pour
            ouvrir la fiche utilisateur et changer / annuler l&apos;abonnement.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Abonnés actifs"
            value={String(s.active_count ?? 0)}
            icon={<Sparkles className="h-4 w-4" />}
            tone="gold"
          />
          <Stat
            label="MRR estimé"
            value={formatPrice(Number(s.mrr ?? 0))}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="success"
          />
          <Stat
            label="Expirent < 7 jours"
            value={String(s.expiring_within_7_days ?? 0)}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={
              (s.expiring_within_7_days ?? 0) > 0 ? "warning" : "default"
            }
          />
          <Stat
            label="Annulés (30j)"
            value={String(s.cancelled_last_30_days ?? 0)}
            icon={<RotateCcw className="h-4 w-4" />}
          />
        </div>

        <SubscriptionsFilter
          plans={planOptions}
          currentPlan={plan ?? ""}
          includeInactive={includeInactive}
          currentQuery={searchTerm}
        />

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.6fr_120px_110px_140px_120px_120px_60px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
            <div>Utilisateur</div>
            <div>Plan</div>
            <div>Mois</div>
            <div>Quota / utilisé</div>
            <div>Période fin</div>
            <div>Statut</div>
            <div></div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {subs.length === 0 && (
              <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
                Aucun abonnement {includeInactive ? "" : "actif"}.
              </div>
            )}
            {subs.map((r) => (
              <div
                key={r.subscription_id}
                className="p-4 text-sm hover:bg-[var(--surface-2)] transition-colors"
              >
                {/* Desktop row — same column layout as the header */}
                <div className="hidden md:grid md:grid-cols-[1.6fr_120px_110px_140px_120px_120px_60px] gap-3 items-center">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="font-semibold hover:text-[var(--gold)] truncate block"
                    >
                      {r.user_label || r.user_email || r.user_id.slice(0, 8)}
                    </Link>
                    <div className="text-[11px] text-[var(--foreground-muted)] truncate">
                      {r.user_email}
                    </div>
                  </div>
                  <div>
                    <Badge size="sm" variant={badgeVariant(r.plan_slug)}>
                      {r.plan_name}
                    </Badge>
                  </div>
                  <div className="font-bold tabular-nums">
                    {formatPrice(Number(r.monthly_price))}
                  </div>
                  <div className="text-xs tabular-nums">
                    {r.listings_per_month === -1
                      ? "∞"
                      : `${r.listings_used_this_period} / ${r.listings_per_month}`}
                    <div className="text-[10px] text-[var(--foreground-muted)]">
                      {r.payment_provider ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs tabular-nums">
                    {new Date(r.current_period_end).toLocaleDateString("fr-TN")}
                  </div>
                  <div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-end">
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="text-xs font-semibold text-[var(--gold)] hover:underline"
                    >
                      Gérer →
                    </Link>
                  </div>
                </div>

                {/* Mobile card — header (user + badges) then a 2-col label/value grid */}
                <Link
                  href={`/admin/users/${r.user_id}`}
                  className="md:hidden block space-y-3 active:opacity-80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {r.user_label || r.user_email || r.user_id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-[var(--foreground-muted)] truncate">
                        {r.user_email}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge size="sm" variant={badgeVariant(r.plan_slug)}>
                        {r.plan_name}
                      </Badge>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <MobileCell label="Mois">
                      <span className="font-bold tabular-nums">
                        {formatPrice(Number(r.monthly_price))}
                      </span>
                    </MobileCell>
                    <MobileCell label="Quota">
                      <span className="font-bold tabular-nums">
                        {r.listings_per_month === -1
                          ? "∞"
                          : `${r.listings_used_this_period} / ${r.listings_per_month}`}
                      </span>
                    </MobileCell>
                    <MobileCell label="Période fin">
                      <span className="tabular-nums">
                        {new Date(r.current_period_end).toLocaleDateString(
                          "fr-TN",
                        )}
                      </span>
                    </MobileCell>
                    <MobileCell label="Fournisseur">
                      <span className="text-[var(--foreground-muted)]">
                        {r.payment_provider ?? "—"}
                      </span>
                    </MobileCell>
                  </div>
                  <div className="text-[var(--gold)] text-xs font-semibold">
                    Gérer →
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function badgeVariant(
  slug: string,
): "goldFilled" | "gold" | "default" {
  if (slug === "gold") return "goldFilled";
  if (slug === "diamond") return "gold";
  return "default";
}

function MobileCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: SubRow["status"] }) {
  const variant =
    status === "active"
      ? "success"
      : status === "past_due"
        ? "warning"
        : status === "cancelled"
          ? "default"
          : "danger";
  const label =
    status === "active"
      ? "Actif"
      : status === "past_due"
        ? "En retard"
        : status === "cancelled"
          ? "Annulé"
          : "Expiré";
  return (
    <Badge size="sm" variant={variant}>
      {label}
    </Badge>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "gold" | "success" | "warning";
}) {
  const c =
    tone === "gold"
      ? "text-[var(--gold)]"
      : tone === "success"
        ? "text-emerald-400"
        : tone === "warning"
          ? "text-amber-300"
          : "text-foreground";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-lg font-extrabold tabular-nums ${c}`}>
        {value}
      </div>
    </div>
  );
}
