import { AdminShell } from "@/components/layout/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CATEGORY_LABELS: Record<string, string> = {
  sedan: "Sedan",
  hatchback: "Hatchback",
  suv: "SUV",
  pickup: "Pickup",
  van: "Van",
  coupe: "Coupé",
  convertible: "Convertible",
  wagon: "Wagon",
};

export default async function AnalyticsPage() {
  const supabase = await createClient();

  // Pull what we need with simple parallel queries.
  const [auctionsAgg, txsAgg, allAuctions] = await Promise.all([
    supabase
      .from("auctions")
      .select("id, status, current_price, category, city, created_at, end_time, original_end_time"),
    supabase
      .from("transactions")
      .select("amount, type, direction, created_at")
      .gte(
        "created_at",
        new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
      ),
    supabase.from("auctions").select("category, city"),
  ]);

  const auctions = auctionsAgg.data ?? [];
  const txs = txsAgg.data ?? [];

  const ended = auctions.filter((a) => a.status === "ended");
  const cancelled = auctions.filter(
    (a) => a.status === "cancelled" || a.status === "reserve_not_met",
  );
  const total = ended.length + cancelled.length;
  const conversion = total === 0 ? 0 : Math.round((ended.length / total) * 100);

  const avgSale =
    ended.length === 0
      ? 0
      : ended.reduce((s, a) => s + Number(a.current_price), 0) / ended.length;

  const avgDurationDays =
    auctions.length === 0
      ? 0
      : auctions
          .map((a) => {
            const start = new Date(a.created_at).getTime();
            const end = new Date(a.original_end_time ?? a.end_time).getTime();
            return Math.max(0, (end - start) / (24 * 3600 * 1000));
          })
          .reduce((s, x) => s + x, 0) / auctions.length;

  const withdrawalRate =
    ended.length === 0
      ? 0
      : Math.round(
          (cancelled.length / Math.max(1, ended.length + cancelled.length)) *
            1000,
        ) / 10;

  // Revenue by month (last 6 months) — net commission income
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  for (const t of txs) {
    if (t.type !== "commission") continue;
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) {
      buckets.set(
        key,
        (buckets.get(key) ?? 0) +
          Number(t.amount) * (t.direction === "in" ? 1 : -1),
      );
    }
  }
  const monthly = Array.from(buckets.entries()).map(([k, v]) => ({
    label: k.slice(5),
    value: Math.round(v),
  }));

  // Categories
  const catCounts = new Map<string, number>();
  for (const a of allAuctions.data ?? []) {
    catCounts.set(a.category, (catCounts.get(a.category) ?? 0) + 1);
  }
  const categories = Array.from(catCounts.entries())
    .map(([k, v]) => ({ label: CATEGORY_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Cities
  const cityCounts = new Map<string, number>();
  for (const a of allAuctions.data ?? []) {
    cityCounts.set(a.city, (cityCounts.get(a.city) ?? 0) + 1);
  }
  const totalCities = Array.from(cityCounts.values()).reduce((s, v) => s + v, 0);
  const cities = Array.from(cityCounts.entries())
    .map(([k, v]) => ({
      label: k,
      count: v,
      pct: totalCities === 0 ? 0 : Math.round((v / totalCities) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        <h1 className="text-2xl md:text-3xl font-extrabold">Analyses</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Taux de conversion" value={`${conversion}%`} />
          <Card label="Vente moyenne" value={formatPrice(Math.round(avgSale))} />
          <Card label="Durée moyenne d'enchère" value={`${avgDurationDays.toFixed(1)} jours`} />
          <Card label="Taux d'annulation" value={`${withdrawalRate}%`} />
        </div>

        <Section title="Commissions Mazed (6 derniers mois)">
          {monthly.every((m) => m.value === 0) ? (
            <p className="text-sm text-[var(--foreground-muted)] py-6 text-center">
              Aucune commission pour le moment
            </p>
          ) : (
            <RevenueChart data={monthly} />
          )}
        </Section>

        <Section title="Répartition des enchères par catégorie">
          {categories.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-6 text-center">
              Aucune donnée pour le moment
            </p>
          ) : (
            <CategoryBars data={categories} />
          )}
        </Section>

        <Section title="Villes les plus actives">
          {cities.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-6 text-center">
              Aucune donnée pour le moment
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {cities.map((c) => (
                <Row key={c.label} label={c.label} pct={c.pct} count={c.count} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold mb-3 text-[var(--foreground-muted)] uppercase">
        {title}
      </h2>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4">
        {children}
      </div>
    </section>
  );
}

function RevenueChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="grid grid-cols-6 gap-2 h-48 items-end">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 h-full">
          <div className="text-[10px] tabular-nums text-[var(--foreground-muted)]">
            {d.value > 0 ? formatPrice(d.value) : "—"}
          </div>
          <div className="flex-1 w-full flex items-end">
            <div
              className="w-full rounded-t-md gradient-gold"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }}
            />
          </div>
          <div className="text-[10px] text-[var(--foreground-subtle)]">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function CategoryBars({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colors = [
    "var(--gold)",
    "var(--gold-bright)",
    "#b8941f",
    "#8a6f17",
    "#5a4a10",
    "#3d3208",
  ];
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className="w-20 text-xs">{d.label}</div>
          <div className="flex-1 h-7 bg-[var(--surface-2)] rounded-md overflow-hidden">
            <div
              className="h-full flex items-center justify-end px-2 text-xs font-bold text-black"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: colors[i % colors.length],
              }}
            >
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({
  label,
  pct,
  count,
}: {
  label: string;
  pct: number;
  count: number;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-20 text-xs">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className="h-full bg-[var(--gold)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-10 text-left">{count}</span>
    </li>
  );
}
