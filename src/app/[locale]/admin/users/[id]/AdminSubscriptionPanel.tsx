"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Crown, Plus, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import {
  adminSetUserSubscriptionAction,
  adminCancelUserSubscriptionAction,
} from "@/app/[locale]/admin/actions";

interface Plan {
  slug: string;
  name_fr: string;
  monthly_price: number;
  listings_per_month: number;
}

interface ActiveSub {
  subscriptionId: string;
  planSlug: string;
  planName: string;
  listingsPerMonth: number;
  listingsRemaining: number;
  currentPeriodEnd: string;
  expiresAt: string | null;
}

export function AdminSubscriptionPanel({
  userId,
  plans,
  activeSub,
}: {
  userId: string;
  plans: Plan[];
  activeSub: ActiveSub | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const d = Number(days);
    if (!Number.isFinite(d) || d <= 0) {
      toast("Nombre de jours invalide", "warning");
      return;
    }
    if (!reason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    if (!planSlug) {
      toast("Choisissez un plan", "warning");
      return;
    }
    setBusy(true);
    const r = await adminSetUserSubscriptionAction({
      userId,
      planSlug,
      days: d,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Abonnement activé", "success");
    setOpen(false);
    setReason("");
    router.refresh();
  }

  async function cancel() {
    const r = window.prompt("Raison de l'annulation :", "");
    if (!r || !r.trim()) return;
    setBusy(true);
    const res = await adminCancelUserSubscriptionAction({
      userId,
      reason: r.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast("Abonnement annulé", "warning");
    router.refresh();
  }

  return (
    <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Crown className="h-4 w-4 text-[var(--gold)]" />
            Abonnement Pro
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Activez ou révoquez l&apos;abonnement de cet utilisateur sans
            facturation. Toute action est journalisée.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)} disabled={busy}>
            <Plus className="h-4 w-4" />
            {activeSub ? "Changer / prolonger" : "Activer un plan"}
          </Button>
          {activeSub && (
            <Button
              size="sm"
              variant="danger"
              onClick={cancel}
              disabled={busy}
            >
              <Ban className="h-4 w-4" />
              Annuler
            </Button>
          )}
        </div>
      </div>

      {activeSub ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Cell label="Plan actif">
            <Badge variant="goldFilled" size="sm">
              {activeSub.planName}
            </Badge>
          </Cell>
          <Cell label="Mises en ligne restantes">
            <span className="font-bold tabular-nums">
              {activeSub.listingsPerMonth === -1
                ? "∞"
                : `${activeSub.listingsRemaining} / ${activeSub.listingsPerMonth}`}
            </span>
          </Cell>
          <Cell label="Période en cours jusqu'au">
            <span className="tabular-nums">
              {new Date(activeSub.currentPeriodEnd).toLocaleDateString("fr-TN")}
            </span>
          </Cell>
          <Cell label="Expire le">
            <span className="tabular-nums">
              {activeSub.expiresAt
                ? new Date(activeSub.expiresAt).toLocaleDateString("fr-TN")
                : "—"}
            </span>
          </Cell>
        </div>
      ) : (
        <div className="text-sm text-[var(--foreground-muted)]">
          Aucun abonnement actif. Le quota de mises en ligne gratuites
          s&apos;applique.
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(open && busy)}
        title={activeSub ? "Changer / prolonger l'abonnement" : "Activer un plan"}
        description="L'abonnement actuel sera annulé puis remplacé. Aucun paiement n'est prélevé — c'est un octroi administratif."
        mobileSheet={false}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Plan
            </label>
            <select
              value={planSlug}
              onChange={(e) => setPlanSlug(e.target.value)}
              className="mt-1 w-full h-10 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            >
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name_fr} — {formatPrice(p.monthly_price)} / mois ·{" "}
                  {p.listings_per_month === -1
                    ? "illimité"
                    : `${p.listings_per_month} mises en ligne`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Durée (jours)
            </label>
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1"
            />
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Raison (audit)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submit} disabled={busy}>
            Activer
          </Button>
        </ModalFooter>
      </Modal>
    </section>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
