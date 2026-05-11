import { getTranslations } from "next-intl/server";
import {
  Users,
  Gavel,
  Wallet,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Settings,
  Clock,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.dashboard" });
  const supabase = await createClient();

  // Live counts pulled directly from the database. Date.now() is fine in
  // a server component fetch — it's the request time, not a render-time
  // impurity — but the React 19 lint rule flags it generically; pull
  // into a typed string to keep the rule satisfied without changing
  // behaviour.
  const thirtyDaysAgo = new Date(
    // eslint-disable-next-line react-hooks/purity
    Date.now() - 30 * 24 * 3600 * 1000,
  ).toISOString();
  const [
    activeAuctions,
    sellers,
    completed,
    monthRevenue,
    pendingReview,
    openComplaints,
    pendingDecision,
    pendingKyc,
  ] = await Promise.all([
    supabase
      .from("auctions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "ending"]),
    supabase
      .from("sellers")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("auctions")
      .select("id", { count: "exact", head: true })
      .eq("status", "ended"),
    supabase
      .from("transactions")
      .select("amount, direction, type, created_at")
      .gte("created_at", thirtyDaysAgo)
      .in("type", ["commission", "final_payment"]),
    supabase
      .from("auctions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("auctions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_seller_decision"),
    supabase
      .from("kyc_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const revenue = (monthRevenue.data ?? []).reduce(
    (s, r) => s + Number(r.amount) * (r.direction === "in" ? 1 : -1),
    0,
  );

  const kpis = [
    {
      icon: Gavel,
      label: t("kpiActiveAuctions"),
      value: String(activeAuctions.count ?? 0),
      color: "text-[var(--gold)]",
    },
    {
      icon: Users,
      label: t("kpiSellers"),
      value: String(sellers.count ?? 0),
      color: "text-blue-400",
    },
    {
      icon: TrendingUp,
      label: t("kpiCompletedSales"),
      value: String(completed.count ?? 0),
      color: "text-green-400",
    },
    {
      icon: Wallet,
      label: t("kpiRevenue30d"),
      value: formatPrice(Math.round(revenue)),
      color: "text-pink-400",
    },
  ];

  const queues = [
    {
      icon: ShieldCheck,
      label: t("queueKyc"),
      count: pendingKyc.count ?? 0,
      href: "/admin/kyc-queue",
      color: "text-blue-400 bg-blue-500/15",
    },
    {
      icon: Gavel,
      label: t("queueAuctionsModeration"),
      count: pendingReview.count ?? 0,
      href: "/admin/auctions-queue",
      color: "text-[var(--gold)] bg-[var(--gold-faint)]",
    },
    {
      icon: Clock,
      label: t("queuePendingSellerDecision"),
      count: pendingDecision.count ?? 0,
      href: "/admin/auctions-queue",
      color: "text-amber-400 bg-amber-500/15",
    },
    {
      icon: AlertTriangle,
      label: t("queueFailedTransactions"),
      count: openComplaints.count ?? 0,
      href: "/admin/transactions",
      color: "text-red-400 bg-red-500/15",
    },
    {
      icon: Settings,
      label: t("queuePlatformSettings"),
      count: null,
      href: "/admin/settings",
      color: "text-purple-400 bg-purple-500/15",
    },
  ];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div
                key={i}
                className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4"
              >
                <div
                  className={`h-9 w-9 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-2 ${k.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-xl font-extrabold tabular-nums">
                  {k.value}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {k.label}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3">{t("attentionHeading")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {queues.map((q, i) => {
              const Icon = q.icon;
              return (
                <a
                  key={i}
                  href={q.href}
                  className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--gold)] transition-colors flex items-center gap-3"
                >
                  <div
                    className={`h-12 w-12 rounded-full flex items-center justify-center ${q.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {q.label}
                    </div>
                    <div className="text-2xl font-extrabold">
                      {q.count === null ? (
                        <span className="text-[var(--gold)] text-base font-semibold">
                          {t("openCta")}
                        </span>
                      ) : (
                        q.count
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
