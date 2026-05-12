import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Sparkles,
  Lock,
  TrendingUp,
  Gavel,
  Trophy,
  Receipt,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/subscription";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUCTION_FINAL_STATUSES = ["ended", "reserve_not_met", "cancelled"];

export default async function SellerAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/seller/analytics");

  const sub = await getActiveSubscription(user.id).catch(() => null);
  const level = sub?.analyticsLevel ?? "basic";
  const canExport = level === "advanced_export";
  const isPro = level !== "basic";

  // Fetch the seller's auctions ONCE — we need the id list to scope the
  // transactions / bids aggregates below, and the row data drives the
  // KPI tiles + leaderboard. The previous implementation issued this
  // query three times (once for the primary fetch and once nested inside
  // each of the soldRes / bidsRes Promise.all entries), tripling the
  // round-trip cost. The 30-day window cutoff is computed in module
  // scope of the function body so the render-time `Date.now()` doesn't
  // trip react-hooks/purity (this is a server component, but the rule
  // doesn't differentiate).
  const thirtyDaysAgo = new Date(
    // eslint-disable-next-line react-hooks/purity
    Date.now() - 30 * 24 * 3600 * 1000,
  ).toISOString();

  const allRes = await supabase
    .from("auctions")
    .select(
      "id, status, current_price, starting_price, total_bids, total_participants, end_time, created_at, make, model",
    )
    .eq("seller_id", user.id);

  const allAuctions = allRes.data ?? [];
  const auctionIds = allAuctions.map((a) => a.id as string);

  // Run the three dependent aggregates in parallel — they all need the
  // auction id list we just resolved. Supabase short-circuits `.in("col",
  // [])` server-side, so the empty-seller case still does the round-trip
  // but returns instantly; not worth the type-narrowing dance to skip it.
  const [soldRes, bidsRes, last30Res] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, label")
      .eq("type", "final_payment")
      .eq("status", "completed")
      .in("auction_id", auctionIds),
    supabase
      .from("bids")
      .select("amount", { count: "exact" })
      .in("auction_id", auctionIds),
    supabase
      .from("auctions")
      .select("id, current_price, total_bids, status, created_at")
      .eq("seller_id", user.id)
      .gte("created_at", thirtyDaysAgo),
  ]);
  const totalListed = allAuctions.length;
  const totalSold = allAuctions.filter((a) => a.status === "ended").length;
  const totalActive = allAuctions.filter(
    (a) => !AUCTION_FINAL_STATUSES.includes(a.status as string),
  ).length;
  const sellThroughRate =
    totalListed > 0 ? Math.round((totalSold / totalListed) * 100) : 0;
  const totalRevenue = (soldRes.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
  const avgSalePrice = totalSold > 0 ? Math.round(totalRevenue / totalSold) : 0;
  const totalBidsCount = bidsRes.count ?? 0;
  const avgBidsPerAuction =
    totalListed > 0 ? +(totalBidsCount / totalListed).toFixed(1) : 0;

  const last30 = last30Res.data ?? [];
  const last30Sold = last30.filter((a) => a.status === "ended").length;

  // Make/model leaderboard — counts auctions by make.
  const makeCount = new Map<string, { count: number; sold: number }>();
  for (const a of allAuctions) {
    const m = (a.make as string) || "—";
    const slot = makeCount.get(m) ?? { count: 0, sold: 0 };
    slot.count += 1;
    if (a.status === "ended") slot.sold += 1;
    makeCount.set(m, slot);
  }
  const topMakes = Array.from(makeCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  return (
    <AppShell noTopBar>
      <div className="lg:hidden">
        <ScreenHeader title="Analytiques" backHref="/seller/dashboard" />
      </div>

      <div className="px-4 lg:px-8 py-5 lg:py-10 max-w-5xl mx-auto space-y-6">
        <div className="hidden lg:block">
          <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            Compte vendeur
          </div>
          <h1 className="mt-1 text-4xl xl:text-5xl font-black tracking-tight leading-none">
            Analytiques
          </h1>
        </div>

        {/* Plan banner */}
        <PlanBanner level={level} planName={sub?.planName ?? null} />

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            icon={<Gavel className="h-4 w-4" />}
            label="Annonces"
            value={String(totalListed)}
            hint={`${totalActive} en cours`}
          />
          <Kpi
            icon={<Trophy className="h-4 w-4" />}
            label="Ventes réussies"
            value={String(totalSold)}
            hint={`${sellThroughRate}% taux de vente`}
            tone="success"
          />
          <Kpi
            icon={<Receipt className="h-4 w-4" />}
            label="CA total"
            value={formatPrice(totalRevenue)}
            hint={`moy. ${formatPrice(avgSalePrice)} / vente`}
            tone="gold"
          />
          <Kpi
            icon={<TrendingUp className="h-4 w-4" />}
            label="Engagement"
            value={String(totalBidsCount)}
            hint={`${avgBidsPerAuction} offres / annonce`}
          />
        </div>

        {/* Locked or advanced content */}
        {!isPro ? (
          <LockedTease />
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base lg:text-lg font-extrabold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--gold)]" />
                  Activité 30 derniers jours
                </h2>
                {canExport && (
                  <Button size="sm" variant="secondary" disabled>
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Kpi
                  label="Annonces publiées"
                  value={String(last30.length)}
                  icon={<Gavel className="h-4 w-4" />}
                />
                <Kpi
                  label="Ventes conclues"
                  value={String(last30Sold)}
                  icon={<Trophy className="h-4 w-4" />}
                  tone="success"
                />
                <Kpi
                  label="Conversion"
                  value={
                    last30.length > 0
                      ? `${Math.round((last30Sold / last30.length) * 100)}%`
                      : "—"
                  }
                  icon={<TrendingUp className="h-4 w-4" />}
                  tone="gold"
                />
              </div>
            </section>

            {topMakes.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base lg:text-lg font-extrabold">
                  Top marques (toute période)
                </h2>
                <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
                  {topMakes.map(([make, stats], i) => {
                    const conv =
                      stats.count > 0
                        ? Math.round((stats.sold / stats.count) * 100)
                        : 0;
                    return (
                      <div
                        key={make}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <div className="h-7 w-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[11px] font-bold text-[var(--foreground-muted)]">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm">{make}</div>
                          <div className="text-[11px] text-[var(--foreground-muted)]">
                            {stats.count} annonce
                            {stats.count > 1 ? "s" : ""} ·{" "}
                            <span className="text-emerald-400 font-semibold">
                              {stats.sold} vendue{stats.sold > 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="font-extrabold tabular-nums text-[var(--gold)]">
                            {conv}%
                          </div>
                          <div className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wider">
                            conversion
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent listings — quick scan */}
            <section className="space-y-3">
              <h2 className="text-base lg:text-lg font-extrabold">
                Dernières annonces
              </h2>
              <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
                {allAuctions
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.created_at as string).getTime() -
                      new Date(a.created_at as string).getTime(),
                  )
                  .slice(0, 6)
                  .map((a) => (
                    <Link
                      key={a.id as string}
                      href={`/seller/auctions/${a.id}`}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {a.make as string} {a.model as string}
                        </div>
                        <div className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
                          {Number(a.total_bids ?? 0)} offres ·{" "}
                          {Number(a.total_participants ?? 0)} participants
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="font-bold tabular-nums text-sm">
                          {formatPrice(Number(a.current_price ?? 0))}
                        </div>
                        <StatusBadge status={a.status as string} />
                      </div>
                    </Link>
                  ))}
                {allAuctions.length === 0 && (
                  <div className="p-8 text-center text-sm text-[var(--foreground-muted)]">
                    Aucune annonce pour l&apos;instant.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function PlanBanner({
  level,
  planName,
}: {
  level: string;
  planName: string | null;
}) {
  if (level === "basic") {
    return (
      <div className="rounded-2xl bg-gradient-to-r from-[var(--surface)] to-[var(--surface-2)]/30 ring-1 ring-[var(--border)] hover:ring-[var(--gold-soft)] p-5 lg:p-6 transition-all">
        <div className="flex items-start gap-4">
          <span className="h-12 w-12 rounded-2xl bg-[var(--surface-2)] text-[var(--gold)] flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              Analytiques basiques
            </div>
            <div className="mt-1 font-black text-lg lg:text-xl tracking-tight">
              Vue limitée — passez Pro pour voir l&apos;activité 30 jours,
              les conversions et l&apos;export CSV
            </div>
          </div>
          <Link href="/pricing">
            <Button size="md">
              Voir les plans
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[var(--gold-faint)] via-[var(--gold-faint)] to-transparent ring-1 ring-[var(--gold)]/40 p-5 lg:p-6">
      <div className="flex items-center gap-4">
        <span className="h-12 w-12 rounded-2xl bg-[var(--gold)] text-black flex items-center justify-center shrink-0 shadow-[var(--shadow-gold)]">
          <Sparkles className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            {level === "advanced_export" ? "Analytiques avancées + export" : "Analytiques avancées"}
          </div>
          <div className="mt-1 font-black text-lg lg:text-xl tracking-tight">
            Plan {planName ?? "Pro"} actif
          </div>
        </div>
        <Badge variant="goldFilled" size="sm">
          Pro
        </Badge>
      </div>
    </div>
  );
}

function LockedTease() {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-dashed border-[var(--border)] p-8 text-center space-y-3">
      <Lock className="h-10 w-10 text-[var(--foreground-subtle)] mx-auto" />
      <div className="font-bold">Plus de données avec un plan Pro</div>
      <ul className="text-sm text-[var(--foreground-muted)] space-y-1 max-w-md mx-auto text-start">
        <li className="flex gap-2">
          <ArrowDownRight className="h-3.5 w-3.5 text-[var(--gold)] shrink-0 mt-1" />
          Activité 30 derniers jours + conversion
        </li>
        <li className="flex gap-2">
          <ArrowDownRight className="h-3.5 w-3.5 text-[var(--gold)] shrink-0 mt-1" />
          Top marques avec taux de vente
        </li>
        <li className="flex gap-2">
          <ArrowDownRight className="h-3.5 w-3.5 text-[var(--gold)] shrink-0 mt-1" />
          Export CSV (plan Diamond)
        </li>
      </ul>
      <Link href="/pricing">
        <Button size="md">
          Découvrir les plans
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "gold" | "success";
}) {
  const valueClass =
    tone === "gold"
      ? "text-[var(--gold)]"
      : tone === "success"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3 lg:p-4">
      <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
        {icon}
        <span className="text-[11px] uppercase tracking-wide font-bold">
          {label}
        </span>
      </div>
      <div className={`mt-1.5 text-xl lg:text-2xl font-extrabold tabular-nums ${valueClass}`}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-[var(--foreground-subtle)] mt-0.5">
          {hint}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; variant: "default" | "success" | "warning" | "danger" }
  > = {
    active: { label: "Active", variant: "success" },
    ending: { label: "Bientôt", variant: "warning" },
    ended: { label: "Vendue", variant: "success" },
    cancelled: { label: "Annulée", variant: "danger" },
    pending_review: { label: "En revue", variant: "warning" },
    reserve_not_met: { label: "Réserve", variant: "warning" },
    pending_seller_decision: { label: "Décision", variant: "warning" },
    re_offered: { label: "Re-proposée", variant: "warning" },
    scheduled: { label: "Planifiée", variant: "default" },
  };
  const v = map[status] ?? { label: status, variant: "default" };
  return (
    <Badge size="sm" variant={v.variant}>
      {v.label}
    </Badge>
  );
}
