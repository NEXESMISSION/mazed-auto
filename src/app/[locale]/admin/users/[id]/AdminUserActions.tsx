"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Ban, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  initialActive: boolean;
  currentTrust: number;
}

export function AdminUserActions({ userId, initialActive, currentTrust }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [trustBusy, setTrustBusy] = useState(false);

  async function toggleActive() {
    if (busy) return;
    const next = !active;
    if (!next) {
      const ok = window.confirm(
        "Désactiver ce compte ? L'utilisateur ne pourra plus enchérir, vendre, ni se connecter tant qu'il n'est pas réactivé.",
      );
      if (!ok) return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_user_active", {
      p_user_id: userId,
      p_active: next,
    });
    setBusy(false);
    if (error) {
      toast("Échec : " + error.message, "error");
      return;
    }
    setActive(next);
    toast(next ? "Compte réactivé" : "Compte désactivé", next ? "success" : "warning");
  }

  async function adjustTrust() {
    const d = Math.trunc(Number(delta));
    if (!Number.isFinite(d) || d === 0) {
      toast("Indiquez un delta non nul (ex : +10, -25)", "warning");
      return;
    }
    if (!reason.trim()) {
      toast("Une raison est obligatoire pour le journal d'audit", "warning");
      return;
    }
    setTrustBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_adjust_trust", {
      p_user_id: userId,
      p_delta: d,
      p_reason: reason.trim(),
    });
    setTrustBusy(false);
    if (error) {
      toast(`Échec : ${error.message}`, "error");
      return;
    }
    toast(
      `Trust score ${d > 0 ? "+" : ""}${d} appliqué (raison enregistrée)`,
      "success",
    );
    setTrustOpen(false);
    setDelta("0");
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 w-full md:w-auto">
      {/* Active state pill — shows current status, toggles on click */}
      <button
        type="button"
        onClick={toggleActive}
        disabled={busy}
        className={`inline-flex items-center justify-between gap-3 px-3 h-11 rounded-[var(--radius)] border transition-colors ${
          active
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
            : "bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/15"
        } disabled:opacity-50`}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          {active ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Ban className="h-4 w-4" />
          )}
          {active ? "Compte actif" : "Compte désactivé"}
        </span>
        <span
          className={`relative h-5 w-9 rounded-full transition-colors ${
            active ? "bg-emerald-500" : "bg-red-500/70"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              active ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      <Button
        variant="secondary"
        size="md"
        onClick={() => setTrustOpen(true)}
      >
        <ShieldCheck className="h-4 w-4" />
        Ajuster le trust score
      </Button>

      <Button
        variant="secondary"
        size="md"
        onClick={() => toast("Avertissement envoyé", "info")}
      >
        <AlertTriangle className="h-4 w-4" />
        Envoyer un avertissement
      </Button>

      <Modal
        open={trustOpen}
        onClose={() => setTrustOpen(false)}
        title="Ajuster le trust score"
        description={`Score actuel : ${currentTrust}. Le delta sera ajouté (positif) ou soustrait (négatif), borné à 0–500.`}
        mobileSheet={false}
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Delta (ex : +10, -25)
            </label>
            <Input
              type="number"
              step="1"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              autoFocus
              className="mt-1.5"
            />
            <div className="mt-1 text-[11px] text-[var(--foreground-muted)] tabular-nums">
              Nouveau score :{" "}
              <span className="font-bold text-[var(--gold)]">
                {Math.max(
                  0,
                  Math.min(500, currentTrust + (Math.trunc(Number(delta)) || 0)),
                )}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Raison (obligatoire — journal d&apos;audit)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex : Fraude confirmée sur l'enchère MA-A3F92C — décision support ticket #1234"
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>

          <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-200 leading-relaxed">
            <span className="font-bold">⚠ Action manuelle :</span> les
            ajustements automatiques (KYC, ventes, évaluations) restent
            actifs après cette modification. Utilisez ce levier
            uniquement après une enquête support ou de fraude.
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setTrustOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={adjustTrust} disabled={trustBusy}>
            {trustBusy ? "Application..." : "Appliquer"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
