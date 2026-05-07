"use client";

import { useState } from "react";
import { Download, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { TransactionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const typeLabels: Record<string, string> = {
  deposit: "Caution",
  refund: "Remboursement",
  final_payment: "Paiement final",
  commission: "Commission",
  payout: "Virement",
};

export function TransactionsList({ txs }: { txs: TransactionRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? txs : txs.filter((t) => t.type === filter);

  function exportCsv() {
    const rows = [
      ["Ref", "Date", "Type", "Direction", "Amount", "Label"],
      ...filtered.map((t) => [
        t.ref,
        t.created_at,
        t.type,
        t.direction,
        String(t.amount),
        t.label ?? "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Transactions</h1>
        <Button
          size="sm"
          variant="secondary"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4" />
          Exporter
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4">
        {[
          { v: "all", l: "Tous" },
          { v: "deposit", l: "Cautions" },
          { v: "refund", l: "Remboursements" },
          { v: "final_payment", l: "Paiements finaux" },
          { v: "commission", l: "Commissions" },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`shrink-0 px-3.5 h-8 rounded-full border text-xs font-semibold transition-colors ${
              filter === f.v
                ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                : "bg-[var(--surface)] text-foreground border-[var(--border)]"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
          Aucune transaction pour le moment
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {filtered.map((t) => {
            const isIn = t.direction === "in";
            return (
              <div key={t.id} className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                    isIn
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400",
                  )}
                >
                  {isIn ? (
                    <ArrowDownLeft className="h-5 w-5" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm line-clamp-1">
                    {t.label}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="default" size="sm">
                      {typeLabels[t.type] || t.type}
                    </Badge>
                    <span className="text-xs text-[var(--foreground-muted)]">
                      {t.created_at.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div
                    className={cn(
                      "font-bold tabular-nums",
                      isIn ? "text-green-400" : "text-foreground",
                    )}
                  >
                    {isIn ? "+" : "-"}
                    {formatPrice(Number(t.amount))}
                  </div>
                  <div className="text-[10px] text-[var(--foreground-subtle)]">
                    {t.ref}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
