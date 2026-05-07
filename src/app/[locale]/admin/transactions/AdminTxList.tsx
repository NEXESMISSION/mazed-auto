"use client";

import { useState } from "react";
import { Search, Download, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
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
  payout: "Virement vendeur",
};

const statusColors: Record<
  string,
  "success" | "warning" | "default" | "gold" | "danger"
> = {
  completed: "success",
  pending: "warning",
  processing: "gold",
  failed: "danger",
};

const statusLabels: Record<string, string> = {
  completed: "Terminée",
  pending: "En attente",
  processing: "En cours",
  failed: "Échouée",
};

export function AdminTxList({ initial }: { initial: TransactionRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const txs = initial;

  const filtered = txs
    .filter((t) => filter === "all" || t.type === filter)
    .filter(
      (t) =>
        !q ||
        t.ref.includes(q) ||
        (t.user_label ?? "").includes(q) ||
        (t.label ?? "").includes(q),
    );

  const totals = filtered.reduce(
    (acc, t) => {
      const amt = Number(t.amount);
      if (t.direction === "in") acc.in += amt;
      else acc.out += amt;
      return acc;
    },
    { in: 0, out: 0 },
  );

  function exportCsv() {
    const rows = [
      [
        "Ref",
        "Date",
        "User",
        "Type",
        "Direction",
        "Amount",
        "Status",
        "Label",
      ],
      ...filtered.map((t) => [
        t.ref,
        t.created_at,
        t.user_label ?? "",
        t.type,
        t.direction,
        String(t.amount),
        t.status,
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
    a.download = `mazed-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold">Transactions</h1>
        <Button
          size="sm"
          variant="secondary"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4" />
          Exporter CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Entrées"
          value={formatPrice(totals.in)}
          tone="success"
        />
        <StatCard
          label="Sorties"
          value={formatPrice(totals.out)}
          tone="danger"
        />
        <StatCard label="Nombre de transactions" value={String(filtered.length)} />
        <StatCard
          label="Net"
          value={formatPrice(totals.in - totals.out)}
          tone="gold"
        />
      </div>

      <Input
        placeholder="Rechercher par numéro de transaction ou utilisateur..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        iconLeft={<Search className="h-4 w-4" />}
      />

      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {[
          { v: "all", l: "Tous" },
          { v: "deposit", l: "Cautions" },
          { v: "refund", l: "Remboursements" },
          { v: "final_payment", l: "Paiements finaux" },
          { v: "commission", l: "Commissions" },
          { v: "payout", l: "Virements vendeur" },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={cn(
              "px-4 h-9 rounded-full text-sm font-semibold whitespace-nowrap shrink-0",
              filter === f.v
                ? "bg-[var(--gold)] text-black"
                : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-foreground",
            )}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <div className="hidden md:grid grid-cols-[140px_1fr_1.5fr_1fr_120px_120px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
          <div>Référence</div>
          <div>Utilisateur</div>
          <div>Description</div>
          <div>Type</div>
          <div>Montant</div>
          <div>Statut</div>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
Aucune transaction. Exécutez seed.sql dans Supabase.
            </div>
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                className="grid md:grid-cols-[140px_1fr_1.5fr_1fr_120px_120px] gap-2 p-4 items-center hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="font-mono text-xs text-[var(--foreground-muted)]">
                  {t.ref}
                </div>
                <div>
                  <div className="font-semibold text-sm">{t.user_label}</div>
                  <div className="text-xs text-[var(--foreground-muted)] md:hidden">
                    {t.label}
                  </div>
                </div>
                <div className="hidden md:block text-sm">{t.label}</div>
                <div>
                  <Badge variant="default" size="sm">
                    {typeLabels[t.type]}
                  </Badge>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 font-bold tabular-nums text-sm",
                    t.direction === "in"
                      ? "text-emerald-400"
                      : "text-red-400",
                  )}
                >
                  {t.direction === "in" ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                  {formatPrice(Number(t.amount))}
                </div>
                <div>
                  <Badge variant={statusColors[t.status]} size="sm">
                    {statusLabels[t.status]}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "gold";
}) {
  const colors = {
    default: "text-foreground",
    success: "text-emerald-400",
    danger: "text-red-400",
    gold: "text-[var(--gold)]",
  };
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      <div className={cn("text-lg font-extrabold tabular-nums", colors[tone])}>
        {value}
      </div>
    </div>
  );
}
