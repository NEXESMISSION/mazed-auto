import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { TrendingUp, Users, Trophy } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface FunnelRow {
  signups: number;
  email_verified: number;
  kyc_verified: number;
  first_bid: number;
  first_win: number;
}
interface TopSeller {
  seller_id: string;
  display_name: string | null;
  username: string | null;
  sales_count: number;
  total_amount: number;
  trust_score: number;
}
interface TopBidder {
  user_id: string;
  bid_count: number;
  win_count: number;
  total_won: number;
}
interface HeatmapRow {
  dow: number;
  hour: number;
  bids: number;
}

const DOW_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default async function InsightsPage() {
  const supabase = await createClient();
  const [funnelRes, sellersRes, biddersRes, heatRes] = await Promise.all([
    supabase.rpc("analytics_funnel", { p_days: 90 }).maybeSingle<FunnelRow>(),
    supabase.rpc("analytics_top_sellers", { p_days: 30, p_limit: 10 }),
    supabase.rpc("analytics_top_bidders", { p_days: 30, p_limit: 10 }),
    supabase.rpc("analytics_bidding_heatmap", { p_days: 30 }),
  ]);

  const f: FunnelRow = funnelRes.data ?? {
    signups: 0,
    email_verified: 0,
    kyc_verified: 0,
    first_bid: 0,
    first_win: 0,
  };
  const sellers = (sellersRes.data ?? []) as TopSeller[];
  const bidders = (biddersRes.data ?? []) as TopBidder[];
  const heat = (heatRes.data ?? []) as HeatmapRow[];

  // Build a 7×24 matrix
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  let max = 0;
  for (const r of heat) {
    grid[r.dow][r.hour] = Number(r.bids);
    if (Number(r.bids) > max) max = Number(r.bids);
  }

  const stages: Array<{ label: string; value: number }> = [
    { label: "Inscriptions (90 j)", value: Number(f.signups) },
    { label: "Email vérifié", value: Number(f.email_verified) },
    { label: "KYC vérifié", value: Number(f.kyc_verified) },
    { label: "Première offre", value: Number(f.first_bid) },
    { label: "Première victoire", value: Number(f.first_win) },
  ];
  const top = stages[0].value || 1;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-[var(--gold)]" />
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Tableau d&apos;analyse avancé
          </h1>
        </div>

        <Section title="Entonnoir d'acquisition (90 jours)">
          <div className="space-y-2">
            {stages.map((s, i) => {
              const pct = Math.round((s.value / top) * 100);
              const drop =
                i === 0 ? null : Math.max(0, stages[i - 1].value - s.value);
              const dropPct =
                i === 0 || stages[i - 1].value === 0
                  ? null
                  : Math.round((drop! / stages[i - 1].value) * 100);
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{s.label}</span>
                    <span className="font-bold tabular-nums">
                      {s.value}{" "}
                      {dropPct !== null && (
                        <span className="text-[10px] text-red-300 ml-1">
                          (-{dropPct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--gold)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Heatmap des offres (30 j)"
          tone="default"
        >
          <div className="grid grid-cols-[40px_repeat(24,minmax(14px,1fr))] gap-[2px] text-[10px]">
            <div></div>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="text-center text-[var(--foreground-muted)] tabular-nums"
              >
                {h}
              </div>
            ))}
            {grid.map((row, dow) => (
              <Fragment key={`row-${dow}`}>
                <div className="text-[var(--foreground-muted)] font-bold flex items-center">
                  {DOW_LABELS[dow]}
                </div>
                {row.map((v, h) => {
                  const intensity = max === 0 ? 0 : v / max;
                  return (
                    <div
                      key={`${dow}-${h}`}
                      title={`${DOW_LABELS[dow]} ${h}h : ${v} offres`}
                      className="h-4 rounded-sm"
                      style={{
                        backgroundColor:
                          v === 0
                            ? "var(--surface-2)"
                            : `rgba(212, 175, 55, ${0.15 + intensity * 0.85})`,
                      }}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </Section>

        <Section
          title="Top vendeurs (30 j)"
          icon={<Trophy className="h-5 w-5 text-[var(--gold)]" />}
        >
          {sellers.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {sellers.map((s, i) => (
                <Link
                  key={s.seller_id}
                  href={`/admin/users/${s.seller_id}`}
                  className="grid grid-cols-[30px_1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-[var(--surface-2)]"
                >
                  <span className="font-mono text-xs font-bold text-[var(--foreground-muted)]">
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">
                      {s.display_name ?? "(sans nom)"}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] truncate">
                      @{s.username ?? s.seller_id.slice(0, 8)} · trust{" "}
                      {s.trust_score}
                    </div>
                  </div>
                  <Badge size="sm">{s.sales_count} ventes</Badge>
                  <span className="font-bold text-[var(--gold)] tabular-nums">
                    {formatPrice(Number(s.total_amount))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Top enchérisseurs (30 j)"
          icon={<Users className="h-5 w-5 text-[var(--gold)]" />}
        >
          {bidders.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {bidders.map((b, i) => (
                <Link
                  key={b.user_id}
                  href={`/admin/users/${b.user_id}`}
                  className="grid grid-cols-[30px_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-[var(--surface-2)]"
                >
                  <span className="font-mono text-xs font-bold text-[var(--foreground-muted)]">
                    #{i + 1}
                  </span>
                  <div className="font-mono text-xs">
                    {b.user_id.slice(0, 8)}
                  </div>
                  <Badge size="sm">{b.bid_count} offres</Badge>
                  <span className="text-xs text-emerald-400">
                    {b.win_count} ✓
                  </span>
                  <span className="font-bold text-[var(--gold)] tabular-nums">
                    {formatPrice(Number(b.total_won))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default";
}) {
  return (
    <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <h2 className="px-4 py-2.5 text-sm font-bold border-b border-[var(--border)] flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty() {
  return (
    <div className="text-center text-sm text-[var(--foreground-muted)] py-2">
      Aucune donnée.
    </div>
  );
}
