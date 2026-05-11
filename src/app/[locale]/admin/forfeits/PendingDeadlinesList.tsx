"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Clock, AlertTriangle, Ban, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import {
  adminForceForfeitAction,
  adminExtendPaymentDeadlineAction,
} from "@/app/[locale]/admin/actions";
import type { PendingDeadline } from "./page";

export function PendingDeadlinesList({ items }: { items: PendingDeadline[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const [forfeitTarget, setForfeitTarget] = useState<PendingDeadline | null>(
    null,
  );
  const [forfeitReason, setForfeitReason] = useState("");

  const [extendTarget, setExtendTarget] = useState<PendingDeadline | null>(
    null,
  );
  const [extendDays, setExtendDays] = useState("3");
  const [extendReason, setExtendReason] = useState("");

  async function submitForfeit() {
    if (!forfeitTarget) return;
    if (!forfeitReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(forfeitTarget.auction_id);
    const r = await adminForceForfeitAction({
      auctionId: forfeitTarget.auction_id,
      reason: forfeitReason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Caution retenue — forfait enregistré", "success");
    setForfeitTarget(null);
    setForfeitReason("");
    router.refresh();
  }

  async function submitExtend() {
    if (!extendTarget) return;
    const d = Number(extendDays);
    if (!Number.isFinite(d) || d <= 0) {
      toast("Nombre de jours invalide", "warning");
      return;
    }
    if (!extendReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(extendTarget.auction_id);
    const r = await adminExtendPaymentDeadlineAction({
      auctionId: extendTarget.auction_id,
      days: d,
      reason: extendReason.trim(),
    });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast(`Délai prolongé de ${d} jours`, "success");
    setExtendTarget(null);
    setExtendDays("3");
    setExtendReason("");
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center text-sm text-[var(--foreground-muted)]">
        ✓ Aucun délai de paiement en cours
      </div>
    );
  }

  return (
    <>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {items.map((p) => {
          const deadline = new Date(p.payment_deadline);
          return (
            <div
              key={p.auction_id}
              className="grid md:grid-cols-[1fr_140px_140px_140px_auto] gap-3 p-4 items-center hover:bg-[var(--surface-2)] transition-colors text-sm"
            >
              <div className="min-w-0">
                <div className="font-bold truncate">
                  {p.make} {p.model} {p.year}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] truncate mt-0.5">
                  Gagnant : {p.winner_label}
                  <span className="ms-2 font-mono text-[10px]">
                    {p.auction_id.slice(0, 8)}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)]">
                  Caution
                </div>
                <div className="font-bold tabular-nums">
                  {formatPrice(Number(p.participation_deposit))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)]">
                  Prix final
                </div>
                <div className="font-bold tabular-nums">
                  {formatPrice(Number(p.current_price))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)]">
                  Échéance
                </div>
                <div className="text-xs tabular-nums">
                  {deadline.toLocaleDateString("fr-TN")}
                </div>
                {p.urgency === "expired" ? (
                  <Badge size="sm" variant="danger" className="mt-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    expirée
                  </Badge>
                ) : p.urgency === "soon" ? (
                  <Badge size="sm" variant="warning" className="mt-0.5">
                    <Clock className="h-3 w-3" />
                    &lt; 24h
                  </Badge>
                ) : (
                  <Badge size="sm" variant="default" className="mt-0.5">
                    en cours
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                <Link
                  href={`/admin/auctions/${p.auction_id}`}
                  className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-semibold rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors"
                  title="Voir l'enchère"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setExtendTarget(p);
                    setExtendDays("3");
                    setExtendReason("");
                  }}
                  disabled={busy === p.auction_id}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Prolonger
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setForfeitTarget(p);
                    setForfeitReason("");
                  }}
                  disabled={busy === p.auction_id}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Retenir caution
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!forfeitTarget}
        onClose={() => setForfeitTarget(null)}
        title="Forcer la retenue de la caution"
        description={
          forfeitTarget
            ? `${forfeitTarget.make} ${forfeitTarget.model} ${forfeitTarget.year} — caution de ${formatPrice(Number(forfeitTarget.participation_deposit))}.\nLa caution sera répartie immédiatement (70% vendeur, 30% plateforme) et l'enchère sera ré-attribuée au bidder suivant.`
            : ""
        }
        mobileSheet={false}
      >
        <textarea
          value={forfeitReason}
          onChange={(e) => setForfeitReason(e.target.value)}
          rows={3}
          placeholder="Raison (transmise à l'enchérisseur et journalisée)"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <ModalFooter>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setForfeitTarget(null)}
          >
            Annuler
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={submitForfeit}
            disabled={busy !== null}
          >
            Confirmer la retenue
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={!!extendTarget}
        onClose={() => setExtendTarget(null)}
        title="Prolonger le délai de paiement"
        description={
          extendTarget
            ? `${extendTarget.make} ${extendTarget.model} ${extendTarget.year} — donne plus de temps à ${extendTarget.winner_label} pour payer.`
            : ""
        }
        mobileSheet={false}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Jours à ajouter
            </label>
            <Input
              type="number"
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="mt-1"
            />
          </div>
          <textarea
            value={extendReason}
            onChange={(e) => setExtendReason(e.target.value)}
            rows={2}
            placeholder="Raison (audit)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setExtendTarget(null)}
          >
            Annuler
          </Button>
          <Button size="md" onClick={submitExtend} disabled={busy !== null}>
            Prolonger
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
