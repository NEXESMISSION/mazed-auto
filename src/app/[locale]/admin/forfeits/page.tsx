import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Forfeit {
  id: string;
  auction_id: string;
  user_id: string;
  user_label: string | null;
  amount: number;
  seller_share: number;
  platform_share: number;
  reason: "payment_deadline_expired" | "voluntary";
  forfeited_at: string;
}

export default async function ForfeitsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auction_forfeits")
    .select("*")
    .order("forfeited_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Forfeit[];

  const totals = rows.reduce(
    (acc, f) => {
      acc.total += Number(f.amount);
      acc.platform += Number(f.platform_share);
      acc.seller += Number(f.seller_share);
      return acc;
    },
    { total: 0, platform: 0, seller: 0 },
  );

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Cautions retenues
          </h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>
        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total retenu" value={formatPrice(totals.total)} />
          <Stat label="Part plateforme" value={formatPrice(totals.platform)} tone="gold" />
          <Stat label="Part vendeurs" value={formatPrice(totals.seller)} tone="success" />
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1fr_120px_120px_120px_120px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
            <div>Utilisateur</div>
            <div>Enchère</div>
            <div>Montant</div>
            <div>Vendeur 70%</div>
            <div>Plateforme 30%</div>
            <div>Date</div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {rows.length === 0 && (
              <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
                Aucune caution retenue.
              </div>
            )}
            {rows.map((f) => (
              <div
                key={f.id}
                className="grid md:grid-cols-[1fr_1fr_120px_120px_120px_120px] gap-2 p-4 items-center hover:bg-[var(--surface-2)] transition-colors text-sm"
              >
                <div className="font-semibold truncate">
                  {f.user_label ?? f.user_id.slice(0, 8)}
                </div>
                <div className="font-mono text-xs text-[var(--foreground-muted)] truncate">
                  {f.auction_id.slice(0, 8)}
                </div>
                <div className="font-bold tabular-nums">
                  {formatPrice(Number(f.amount))}
                </div>
                <div className="text-emerald-400 tabular-nums">
                  {formatPrice(Number(f.seller_share))}
                </div>
                <div className="text-[var(--gold)] tabular-nums">
                  {formatPrice(Number(f.platform_share))}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
                  {new Date(f.forfeited_at).toLocaleDateString("fr-TN")}
                  <Badge
                    size="sm"
                    variant={f.reason === "voluntary" ? "warning" : "danger"}
                    className="block mt-0.5"
                  >
                    {f.reason === "voluntary" ? "volontaire" : "délai dépassé"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gold" | "success";
}) {
  const c =
    tone === "gold"
      ? "text-[var(--gold)]"
      : tone === "success"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
