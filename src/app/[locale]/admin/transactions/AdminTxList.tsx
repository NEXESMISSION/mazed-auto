"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Ban,
  Undo2,
  Receipt,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { TransactionRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  voidTransactionAction,
  createTransactionAction,
  refundDepositAction,
  verifyManualPaymentAction,
  getReceiptSignedUrlAction,
} from "@/app/[locale]/admin/actions";

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
  pending_verification: "warning",
};

const statusLabels: Record<string, string> = {
  completed: "Terminée",
  pending: "En attente",
  processing: "En cours",
  failed: "Échouée",
  pending_verification: "À vérifier",
};

const manualMethodLabels: Record<string, string> = {
  bank_transfer: "Virement bancaire",
  d17: "D17",
};

export function AdminTxList({ initial }: { initial: TransactionRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const tPrompt = useTranslations("admin.prompts");
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const txs = initial;

  // Manual transaction modal
  const [createOpen, setCreateOpen] = useState(false);
  const [cUserId, setCUserId] = useState("");
  const [cType, setCType] = useState<
    "deposit" | "refund" | "final_payment" | "commission" | "payout"
  >("refund");
  const [cDirection, setCDirection] = useState<"in" | "out">("out");
  const [cAmount, setCAmount] = useState("");
  const [cLabel, setCLabel] = useState("");
  const [cAuctionId, setCAuctionId] = useState("");
  const [cReason, setCReason] = useState("");
  const [cBusy, setCBusy] = useState(false);

  async function refundDeposit(t: TransactionRow) {
    const reason = window.prompt(
      tPrompt("txRefund", { amount: formatPrice(Number(t.amount)) }),
      "",
    );
    if (!reason || !reason.trim()) return;
    const r = await refundDepositAction({
      txId: t.id,
      reason: reason.trim(),
    });
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Caution remboursée", "success");
    router.refresh();
  }

  async function voidTx(t: TransactionRow) {
    const reason = window.prompt(
      tPrompt("txVoid", { ref: t.ref }),
      "",
    );
    if (!reason || !reason.trim()) return;
    const r = await voidTransactionAction({
      txId: t.id,
      reason: reason.trim(),
    });
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Transaction annulée", "warning");
    router.refresh();
  }

  async function submitCreate() {
    const amt = Number(cAmount);
    if (!cUserId.trim() || !Number.isFinite(amt) || amt <= 0 || !cLabel.trim()) {
      toast("user_id, montant > 0 et libellé requis", "warning");
      return;
    }
    setCBusy(true);
    const r = await createTransactionAction({
      userId: cUserId.trim(),
      type: cType,
      direction: cDirection,
      amount: amt,
      label: cLabel.trim(),
      auctionId: cAuctionId.trim() || null,
      reason: cReason.trim() || null,
    });
    setCBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Transaction créée", "success");
    setCreateOpen(false);
    setCUserId("");
    setCAmount("");
    setCLabel("");
    setCAuctionId("");
    setCReason("");
    router.refresh();
  }

  const filtered = txs
    .filter((t) => {
      if (filter === "all") return true;
      if (filter === "to_verify") return t.status === "pending_verification";
      return t.type === filter;
    })
    .filter(
      (t) =>
        !q ||
        t.ref.includes(q) ||
        (t.user_label ?? "").includes(q) ||
        (t.label ?? "").includes(q),
    );

  const pendingVerificationCount = txs.filter(
    (t) => t.status === "pending_verification",
  ).length;

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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Créer
          </Button>
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
          {
            v: "to_verify",
            l: `À vérifier${pendingVerificationCount > 0 ? ` (${pendingVerificationCount})` : ""}`,
            highlight: pendingVerificationCount > 0,
          },
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
                : f.highlight
                  ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/25"
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
                className={cn(
                  "grid md:grid-cols-[140px_1fr_1.5fr_1fr_120px_120px] gap-2 p-4 items-center hover:bg-[var(--surface-2)] transition-colors",
                  t.status === "pending_verification" &&
                    "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]",
                )}
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
                <div className="hidden md:block text-sm">
                  {t.label}
                  {t.manual_method && (
                    <div className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                      via {manualMethodLabels[t.manual_method]}
                    </div>
                  )}
                </div>
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
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={statusColors[t.status]} size="sm">
                    {statusLabels[t.status]}
                  </Badge>
                  <div className="ms-auto flex items-center gap-1">
                    {t.status === "pending_verification" && (
                      <ManualVerifyControls tx={t} />
                    )}
                    {t.type === "deposit" && t.status === "completed" && (
                      <button
                        type="button"
                        onClick={() => refundDeposit(t)}
                        title="Rembourser cette caution"
                        aria-label="Rembourser cette caution"
                        className="h-10 w-10 md:h-7 md:w-7 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {t.status !== "failed" &&
                      t.status !== "pending_verification" && (
                        <button
                          type="button"
                          onClick={() => voidTx(t)}
                          title="Annuler la transaction"
                          aria-label="Annuler la transaction"
                          className="h-10 w-10 md:h-7 md:w-7 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-red-500/40 hover:text-red-300 transition-colors"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---------- Create transaction modal ---------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Créer une transaction manuelle"
        description="À utiliser pour les remboursements ad hoc, ajustements de commission, crédits goodwill."
        mobileSheet={false}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              ID utilisateur
            </label>
            <Input
              value={cUserId}
              onChange={(e) => setCUserId(e.target.value)}
              placeholder="UUID"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Type
              </label>
              <select
                value={cType}
                onChange={(e) => setCType(e.target.value as typeof cType)}
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
              >
                <option value="deposit">Caution</option>
                <option value="refund">Remboursement</option>
                <option value="final_payment">Paiement final</option>
                <option value="commission">Commission</option>
                <option value="payout">Virement</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Direction
              </label>
              <select
                value={cDirection}
                onChange={(e) => setCDirection(e.target.value as "in" | "out")}
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
              >
                <option value="in">Entrée</option>
                <option value="out">Sortie</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                Montant DT
              </label>
              <Input
                type="number"
                step="0.01"
                value={cAmount}
                onChange={(e) => setCAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                ID enchère (opt.)
              </label>
              <Input
                value={cAuctionId}
                onChange={(e) => setCAuctionId(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Libellé
            </label>
            <Input
              value={cLabel}
              onChange={(e) => setCLabel(e.target.value)}
              placeholder="Ex : Remboursement geste commercial — incident #42"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Raison interne (audit)
            </label>
            <textarea
              value={cReason}
              onChange={(e) => setCReason(e.target.value)}
              rows={2}
              className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setCreateOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitCreate} disabled={cBusy}>
            {cBusy ? "Création..." : "Créer"}
          </Button>
        </ModalFooter>
      </Modal>
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

/** Per-row controls for manual-payment verification. Three actions:
 *
 *   - View receipt: opens a fresh 60s signed URL in a new tab
 *   - Approve: flips status → completed via verify_manual_payment()
 *   - Reject: prompts for a reason, flips status → failed
 *
 * The signed URL is minted on demand (not eagerly per row) so the
 * page render doesn't fan out a Storage API call per row.
 */
function ManualVerifyControls({ tx }: { tx: TransactionRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"view" | "approve" | "reject" | null>(null);

  async function viewReceipt() {
    if (!tx.receipt_url) return;
    setBusy("view");
    try {
      const r = await getReceiptSignedUrlAction({ path: tx.receipt_url });
      if (!r.ok) {
        toast("Impossible d'afficher le reçu : " + r.error, "error");
        return;
      }
      if (!r.data) {
        toast("Impossible d'afficher le reçu", "error");
        return;
      }
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!window.confirm(
      `Approuver ce paiement de ${formatPrice(Number(tx.amount))} ? L'utilisateur sera notifié.`,
    )) return;
    setBusy("approve");
    const r = await verifyManualPaymentAction({
      txId: tx.id,
      action: "approve",
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("✓ Paiement vérifié", "success");
    router.refresh();
  }

  async function reject() {
    const reason = window.prompt(
      "Motif du refus (sera envoyé à l'utilisateur) :",
      "",
    );
    if (!reason || !reason.trim()) return;
    setBusy("reject");
    const r = await verifyManualPaymentAction({
      txId: tx.id,
      action: "reject",
      notes: reason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Paiement refusé", "warning");
    router.refresh();
  }

  return (
    <>
      {tx.receipt_url && (
        <button
          type="button"
          onClick={viewReceipt}
          disabled={busy !== null}
          title="Voir le reçu"
          aria-label="Voir le reçu"
          className="h-10 w-10 md:h-7 md:w-7 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors disabled:opacity-50"
        >
          {busy === "view" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Receipt className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={approve}
        disabled={busy !== null}
        title="Approuver"
        aria-label="Approuver"
        className="h-10 w-10 md:h-7 md:w-7 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 text-emerald-300 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors disabled:opacity-50"
      >
        {busy === "approve" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
        )}
      </button>
      <button
        type="button"
        onClick={reject}
        disabled={busy !== null}
        title="Refuser"
        aria-label="Refuser"
        className="h-10 w-10 md:h-7 md:w-7 rounded-full bg-red-500/15 ring-1 ring-red-500/40 text-red-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
      >
        {busy === "reject" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5" strokeWidth={2.6} />
        )}
      </button>
    </>
  );
}

