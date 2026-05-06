import { createClient } from "@/lib/supabase/server";
import { getPlatformStats } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export async function StatsBar() {
  const supabase = await createClient();
  const stats = await getPlatformStats(supabase);

  const items = [
    { label: "Enchères actives", value: stats.activeAuctions, suffix: "+" },
    { label: "Ventes réalisées", value: stats.completedDeals, suffix: "+" },
    { label: "Vendeurs vérifiés", value: stats.verifiedSellers, suffix: "+" },
    { label: "Évaluation", value: stats.satisfaction, suffix: "/5" },
  ];

  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl md:text-3xl font-extrabold text-[var(--gold)] tabular-nums">
                {typeof item.value === "number" && item.value % 1 === 0
                  ? formatNumber(item.value)
                  : item.value}
                <span className="text-base text-[var(--foreground-muted)]">
                  {item.suffix}
                </span>
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-1">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
