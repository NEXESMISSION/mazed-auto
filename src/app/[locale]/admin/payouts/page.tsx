import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { PayoutsList } from "./PayoutsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PayoutRow {
  id: string;
  seller_id: string;
  auction_id: string | null;
  gross_amount: number;
  commission: number;
  tva: number;
  net_amount: number;
  rib: string | null;
  bank_name: string | null;
  status: "pending" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  paid_reference: string | null;
  created_at: string;
}

export default async function PayoutsPage() {
  const supabase = await createClient();
  // Two queries instead of an embed — payouts.seller_id FKs auth.users
  // (not public.sellers), so PostgREST can't auto-join sellers via the
  // schema cache. Cheaper to denormalise here than over-engineer the FK.
  const { data: rawRows, error } = await supabase
    .from("payouts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const payouts = (rawRows ?? []) as PayoutRow[];

  const sellerIds = Array.from(new Set(payouts.map((p) => p.seller_id)));
  const sellerMap: Record<
    string,
    { display_name: string; username: string }
  > = {};
  if (sellerIds.length > 0) {
    const { data: sellers } = await supabase
      .from("sellers")
      .select("id, display_name, username")
      .in("id", sellerIds);
    for (const s of sellers ?? []) {
      sellerMap[s.id as string] = {
        display_name: (s.display_name as string) ?? "",
        username: (s.username as string) ?? "",
      };
    }
  }
  const rows = payouts.map((p) => ({ ...p, seller: sellerMap[p.seller_id] ?? null }));

  const totals = rows.reduce(
    (acc, p) => {
      if (p.status === "paid") acc.paid += Number(p.net_amount);
      else if (p.status === "pending" || p.status === "approved")
        acc.pending += Number(p.net_amount);
      return acc;
    },
    { pending: 0, paid: 0 },
  );

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Virements aux vendeurs
          </h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="À payer" value={formatPrice(totals.pending)} tone="gold" />
          <Stat label="Payés" value={formatPrice(totals.paid)} tone="success" />
          <Stat label="Nb total" value={String(rows.length)} />
        </div>

        <PayoutsList rows={rows} />
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
