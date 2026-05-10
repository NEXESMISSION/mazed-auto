import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { anonBidder } from "@/lib/anon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AutoBidsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auto_bids")
    .select("id, user_id, max_amount, is_active, created_at, cancelled_at")
    .eq("auction_id", id)
    .order("max_amount", { ascending: false });
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    max_amount: number;
    is_active: boolean;
    created_at: string;
    cancelled_at: string | null;
  }>;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <Link
          href={`/admin/auctions/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;enchère
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Auto-bids (proxy bidding)
        </h1>
        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--foreground-muted)]">
              Aucun auto-bid sur cette enchère.
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="grid grid-cols-[40px_1fr_auto_auto_auto] gap-3 items-center px-4 py-3"
            >
              <div className="font-mono text-xs text-[var(--foreground-muted)] tabular-nums">
                #{i + 1}
              </div>
              <div className="text-sm font-semibold">
                {anonBidder(r.user_id, i)}
              </div>
              <div className="font-bold tabular-nums text-[var(--gold)]">
                ≤ {formatPrice(Number(r.max_amount))}
              </div>
              <Badge
                size="sm"
                variant={r.is_active ? "success" : "default"}
              >
                {r.is_active ? "actif" : "annulé"}
              </Badge>
              <div className="text-[10px] text-[var(--foreground-muted)] tabular-nums">
                {new Date(r.created_at).toLocaleDateString("fr-TN")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
