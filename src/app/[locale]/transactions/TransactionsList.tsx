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
      {/* Mobile title row — desktop has its own header in the page wrapper */}
      <div className="lg:hidden flex items-center justify-between">
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

      {/* Filter pills + export */}
      <div className="flex items-center gap-2 lg:gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-2 lg:gap-2.5">
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
              className={`shrink-0 px-3.5 lg:px-5 h-8 lg:h-10 rounded-full border text-xs lg:text-sm font-semibold lg:font-bold transition-colors ${
                filter === f.v
                  ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                  : "bg-[var(--surface)] text-foreground border-[var(--border)] hover:border-[var(--gold-soft)]"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
        <div className="hidden lg:flex flex-1 justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="lg:h-10 lg:px-4"
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-12 lg:p-16 text-center text-sm lg:text-base text-[var(--foreground-muted)]">
          Aucune transaction pour le moment
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] lg:ring-1 lg:ring-[var(--border)] lg:border-0 divide-y divide-[var(--border)]">
          {filtered.map((t) => {
            const isIn = t.direction === "in";
            return (
              <div
                key={t.id}
                className="p-4 lg:p-5 flex items-center gap-3 lg:gap-5 hover:bg-[var(--surface-2)]/30 transition-colors"
              >
                <div
                  className={cn(
                    "shrink-0 h-10 w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center",
                    isIn
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400",
                  )}
                >
                  {isIn ? (
                    <ArrowDownLeft className="h-5 w-5 lg:h-5.5 lg:w-5.5" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5 lg:h-5.5 lg:w-5.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold lg:font-bold text-sm lg:text-base line-clamp-1">
                    {t.label}
                  </div>
                  <div className="flex items-center gap-2 lg:gap-2.5 mt-0.5 lg:mt-1">
                    <Badge variant="default" size="sm">
                      {typeLabels[t.type] || t.type}
                    </Badge>
                    <span className="text-xs lg:text-[13px] text-[var(--foreground-muted)] tabular-nums">
                      {t.created_at.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div
                    className={cn(
                      "font-bold lg:font-extrabold tabular-nums text-base lg:text-lg",
                      isIn ? "text-green-400" : "text-foreground",
                    )}
                  >
                    {isIn ? "+" : "−"}
                    {formatPrice(Number(t.amount))}
                  </div>
                  <div className="text-[10px] lg:text-[11px] text-[var(--foreground-subtle)] font-mono tabular-nums mt-0.5">
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
