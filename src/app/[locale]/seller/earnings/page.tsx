import { Link } from "@/i18n/navigation";
import { TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { mapAuction, type AuctionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { getCommissionConfig } from "@/lib/config";
import type { Auction } from "@/lib/types";
import { ExportCsvButton } from "./ExportCsvButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SaleRow {
  auction: Auction;
  sale: number;
  commission: number;
  tva: number;
  net: number;
  date: string;
  paid: boolean;
}

export default async function EarningsPage() {
  const supabase = await createClient();
  const { sellerPct, sellerCap, tvaRate } = await getCommissionConfig();

  const commissionFor = (sale: number) =>
    Math.min(Math.round(sale * sellerPct), sellerCap);
  const tvaFor = (commission: number) => Math.round(commission * tvaRate);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
          <h1 className="text-2xl font-extrabold">Revenus</h1>
          <div className="text-center py-16 space-y-3">
            <div className="font-bold">Connectez-vous pour voir vos revenus</div>
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const { data: ended } = await supabase
    .from("auctions")
    .select("*, seller:sellers(*)")
    .eq("seller_id", user.id)
    .eq("status", "ended")
    .order("end_time", { ascending: false });

  // Resolve each auction's payment-status in parallel.
  const sales: SaleRow[] = await Promise.all(
    (ended ?? []).map(async (row) => {
      const a = mapAuction(row as unknown as AuctionRow);
      const sale = a.currentPrice;
      const commission = commissionFor(sale);
      const tva = tvaFor(commission);
      const net = sale - commission - tva;
      const { data: paid } = await supabase
        .from("transactions")
        .select("id")
        .eq("auction_id", a.id)
        .eq("type", "final_payment")
        .eq("status", "completed")
        .limit(1);
      return {
        auction: a,
        sale,
        commission,
        tva,
        net,
        date: a.endTime.toISOString().slice(0, 10),
        paid: (paid ?? []).length > 0,
      };
    }),
  );

  const totalNet = sales
    .filter((s) => s.paid)
    .reduce((sum, t) => sum + t.net, 0);
  const totalSale = sales
    .filter((s) => s.paid)
    .reduce((sum, t) => sum + t.sale, 0);
  const totalCommission = sales
    .filter((s) => s.paid)
    .reduce((sum, t) => sum + t.commission, 0);
  const totalTva = sales
    .filter((s) => s.paid)
    .reduce((sum, t) => sum + t.tva, 0);

  // Plain serializable view for the client export button.
  const csvSales = sales.map((s) => ({
    date: s.date,
    label: `${s.auction.vehicle.make} ${s.auction.vehicle.model} ${s.auction.vehicle.year}`,
    sale: s.sale,
    commission: s.commission,
    tva: s.tva,
    net: s.net,
    paid: s.paid,
  }));

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">Revenus</h1>
          <ExportCsvButton sales={csvSales} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border border-[var(--gold-soft)]/40 p-4 col-span-2 md:col-span-1">
            <div className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] mb-2">
              <TrendingUp className="h-3.5 w-3.5" />
              Revenus nets
            </div>
            <div className="text-2xl font-extrabold gradient-gold-text tabular-nums">
              {formatPrice(totalNet)}
            </div>
          </div>
          <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--foreground-muted)] mb-2">
              Total des ventes
            </div>
            <div className="text-xl font-bold tabular-nums">
              {formatPrice(totalSale)}
            </div>
          </div>
          <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--foreground-muted)] mb-2">
              Commissions ({Math.round(sellerPct * 100)}%, plafond {formatPrice(sellerCap)})
            </div>
            <div className="text-xl font-bold tabular-nums text-[var(--foreground-muted)]">
              {formatPrice(totalCommission)}
            </div>
          </div>
          <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--foreground-muted)] mb-2">
              TVA ({Math.round(tvaRate * 100)}% sur la commission)
            </div>
            <div className="text-xl font-bold tabular-nums text-[var(--foreground-muted)]">
              {formatPrice(totalTva)}
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-base font-bold mb-3">Vos ventes</h2>
          {sales.length === 0 ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
              Aucune vente réalisée pour le moment
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {sales.map((t) => (
                <div
                  key={t.auction.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">
                      {t.auction.vehicle.make} {t.auction.vehicle.model}{" "}
                      {t.auction.vehicle.year}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                      {t.date}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div
                      className={`font-bold tabular-nums ${
                        t.paid
                          ? "text-[var(--gold)]"
                          : "text-[var(--foreground-muted)]"
                      }`}
                    >
                      {t.paid ? "+" : ""}
                      {formatPrice(t.net)}
                    </div>
                    <div className="text-[10px] text-[var(--foreground-subtle)]">
                      de {formatPrice(t.sale)} (-{formatPrice(t.commission)}{" "}
                      Commission, -{formatPrice(t.tva)} TVA)
                    </div>
                  </div>
                  <Badge variant={t.paid ? "success" : "warning"} size="sm">
                    {t.paid ? "Payé" : "En attente de paiement"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
