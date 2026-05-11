import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Sparkles,
  Calendar,
  Receipt,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { getActiveSubscription } from "@/lib/subscription";
import { CancelSubscriptionButton } from "./CancelSubscriptionButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HistoryRow {
  subscription_id: string;
  plan_slug: string;
  plan_name: string;
  monthly_price: number;
  status: "active" | "past_due" | "cancelled" | "expired";
  started_at: string;
  current_period_end: string;
  expires_at: string | null;
  payment_provider: string | null;
}

export default async function MySubscriptionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [active, { data: history }] = await Promise.all([
    getActiveSubscription(user.id),
    supabase.rpc("user_subscription_history", { p_user_id: user.id }),
  ]);
  const rows = (history ?? []) as HistoryRow[];

  return (
    <AppShell noTopBar>
      <div className="lg:hidden">
        <ScreenHeader title="Mon abonnement" backHref="/profile" />
      </div>

      <div className="px-4 lg:px-8 py-5 lg:py-10 max-w-3xl mx-auto space-y-5">
        <div className="hidden lg:flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Mon compte
          </Link>
        </div>

        {/* CURRENT PLAN */}
        {active ? (
          <section
            className={`rounded-2xl bg-[var(--surface)] border ring-1 p-5 space-y-4 ${
              active.status === "cancelled"
                ? "border-amber-500/40 ring-amber-500/15"
                : "border-[var(--gold)]/40 ring-[var(--gold)]/20"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className={`text-[11px] uppercase tracking-[0.22em] font-bold flex items-center gap-1.5 ${
                    active.status === "cancelled"
                      ? "text-amber-300"
                      : "text-[var(--gold)]"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {active.status === "cancelled"
                    ? "Abonnement annulé"
                    : "Plan actif"}
                </div>
                <h1 className="text-2xl lg:text-3xl font-extrabold mt-1">
                  {active.planName}
                </h1>
                {active.status === "cancelled" && active.expiresAt && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    Vous conservez les avantages jusqu&apos;au{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {new Date(active.expiresAt).toLocaleDateString("fr-TN")}
                    </span>
                    .
                  </p>
                )}
              </div>
              <Badge
                variant={active.status === "cancelled" ? "warning" : "goldFilled"}
                size="sm"
              >
                {active.status === "cancelled" ? "Annulé" : "Actif"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Cell label="Mises en ligne ce mois">
                <span className="font-bold tabular-nums">
                  {active.listingsPerMonth === -1
                    ? "Illimitées"
                    : `${active.listingsPerMonth - active.listingsRemaining} / ${active.listingsPerMonth}`}
                </span>
              </Cell>
              <Cell label="Priorité de recherche">
                <span className="font-bold">
                  {active.searchPriorityPct > 0
                    ? `+${active.searchPriorityPct}%`
                    : "—"}
                </span>
              </Cell>
              <Cell label="Période en cours jusqu'au">
                <span className="font-bold tabular-nums">
                  {new Date(active.currentPeriodEnd).toLocaleDateString(
                    "fr-TN",
                  )}
                </span>
              </Cell>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors text-sm font-semibold"
              >
                <ArrowUpRight className="h-4 w-4" />
                {active.status === "cancelled"
                  ? "Reprendre / changer de plan"
                  : "Changer de plan"}
              </Link>
              {active.status === "active" && <CancelSubscriptionButton />}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="font-bold text-base">Aucun abonnement actif</div>
            <p className="text-sm text-[var(--foreground-muted)]">
              Souscrivez à un plan Pro pour publier plus d&apos;enchères,
              débloquer la boutique et les analytiques avancées.
            </p>
            <Link href="/pricing">
              <Button size="md">
                Voir les plans
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </section>
        )}

        {/* HISTORY */}
        <section className="space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Historique
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center text-sm text-[var(--foreground-muted)]">
              Aucune ligne d&apos;historique pour l&apos;instant.
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {rows.map((r) => (
                <div
                  key={r.subscription_id}
                  className="p-4 grid grid-cols-[1fr_auto] gap-2 items-center text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {r.plan_name}
                      <span className="ms-2 text-xs text-[var(--foreground-muted)] font-normal">
                        {formatPrice(Number(r.monthly_price))} / mois
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] tabular-nums flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-3 w-3" />
                      du{" "}
                      {new Date(r.started_at).toLocaleDateString("fr-TN")} au{" "}
                      {new Date(r.current_period_end).toLocaleDateString(
                        "fr-TN",
                      )}
                      {r.payment_provider && (
                        <>
                          {" · "}
                          {r.payment_provider}
                        </>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: HistoryRow["status"] }) {
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

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
