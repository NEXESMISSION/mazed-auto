"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Check, X, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import {
  markPayoutPaidAction,
  cancelPayoutAction,
} from "@/app/[locale]/admin/actions";

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
  seller?: { display_name: string; username: string } | null;
}

export function PayoutsList({ rows }: { rows: PayoutRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  // Pulled from `admin.prompts` — the admin panel UI is FR/AR-aware so
  // these confirm dialogs need to follow suit. Previously hardcoded FR
  // meant Arabic admins saw mixed-language dialogs every action.
  const tPrompt = useTranslations("admin.prompts");
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "paid" | "cancelled"
  >("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function pay(p: PayoutRow) {
    const reference = window.prompt(
      tPrompt("payoutMarkPaid", {
        amount: formatPrice(Number(p.net_amount)),
      }),
      "",
    );
    if (!reference || !reference.trim()) return;
    setBusy(p.id);
    const r = await markPayoutPaidAction({
      payoutId: p.id,
      reference: reference.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Virement marqué payé", "success");
    router.refresh();
  }

  async function cancel(p: PayoutRow) {
    const reason = window.prompt(tPrompt("payoutCancelReason"), "");
    if (!reason || !reason.trim()) return;
    setBusy(p.id);
    const r = await cancelPayoutAction({
      payoutId: p.id,
      reason: reason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Virement annulé", "warning");
    router.refresh();
  }

  function exportBatchCsv() {
    const target = filtered.filter((r) => r.status !== "paid" && r.status !== "cancelled");
    const lines = [
      [
        "PayoutID",
        "Seller",
        "Username",
        "Auction",
        "Gross",
        "Commission",
        "TVA",
        "Net",
        "RIB",
        "Bank",
      ],
      ...target.map((p) => [
        p.id,
        p.seller?.display_name ?? "",
        p.seller?.username ?? "",
        p.auction_id ?? "",
        String(p.gross_amount),
        String(p.commission),
        String(p.tva),
        String(p.net_amount),
        p.rib ?? "",
        p.bank_name ?? "",
      ]),
    ];
    const csv = lines
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mazed-payouts-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {(["pending", "approved", "paid", "cancelled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 h-9 rounded-full text-sm border ${
              filter === f
                ? "bg-[var(--gold)] border-[var(--gold)] text-black font-bold"
                : "bg-[var(--surface-2)] border-[var(--border)]"
            }`}
          >
            {f === "all"
              ? "Tous"
              : f === "pending"
                ? "À payer"
                : f === "approved"
                  ? "Approuvés"
                  : f === "paid"
                    ? "Payés"
                    : "Annulés"}
          </button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={exportBatchCsv}
          className="ms-auto"
        >
          <Download className="h-4 w-4" />
          CSV batch banque
        </Button>
      </div>

      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_120px_120px_auto] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
          <div>Vendeur</div>
          <div>Banque / RIB</div>
          <div>Brut → Net</div>
          <div>Statut</div>
          <div>Date</div>
          <div></div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {filtered.length === 0 && (
            <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
              Aucun virement.
            </div>
          )}
          {filtered.map((p) => (
            <div
              key={p.id}
              className="grid md:grid-cols-[1.5fr_1fr_1fr_120px_120px_auto] gap-2 p-4 items-center hover:bg-[var(--surface-2)] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">
                  {p.seller?.display_name ?? "(sans vendeur)"}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] truncate">
                  @{p.seller?.username ?? p.seller_id.slice(0, 8)}
                </div>
              </div>
              <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
                {p.bank_name ?? ""}
                <br />
                {p.rib ?? "—"}
              </div>
              <div className="text-sm tabular-nums">
                <span className="text-[var(--foreground-muted)]">
                  {formatPrice(Number(p.gross_amount))}
                </span>
                <span className="mx-1">→</span>
                <span className="font-bold text-[var(--gold)]">
                  {formatPrice(Number(p.net_amount))}
                </span>
              </div>
              <div>
                <Badge
                  size="sm"
                  variant={
                    p.status === "paid"
                      ? "success"
                      : p.status === "cancelled"
                        ? "danger"
                        : "warning"
                  }
                >
                  {p.status}
                </Badge>
                {p.paid_reference && (
                  <div className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                    {p.paid_reference}
                  </div>
                )}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
                {new Date(p.created_at).toLocaleDateString("fr-TN")}
              </div>
              <div className="flex gap-1 justify-end">
                {(p.status === "pending" || p.status === "approved") && (
                  <>
                    <button
                      type="button"
                      onClick={() => pay(p)}
                      disabled={busy === p.id}
                      title="Marquer payé"
                      aria-label="Marquer ce versement comme payé"
                      className="h-10 w-10 md:h-8 md:w-8 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center justify-center hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cancel(p)}
                      disabled={busy === p.id}
                      title="Annuler"
                      aria-label="Annuler ce versement"
                      className="h-10 w-10 md:h-8 md:w-8 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 flex items-center justify-center hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
