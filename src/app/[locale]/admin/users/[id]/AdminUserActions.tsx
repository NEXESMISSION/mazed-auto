"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Ban,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  Star,
  Mail,
  Phone,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  banUserAction,
  unbanUserAction,
  warnUserAction,
  resetKycAction,
  setOwnershipVerifiedAction,
  setProAction,
  resetEmailVerificationAction,
  resetPhoneVerificationAction,
  dmUserAction,
} from "@/app/[locale]/admin/actions";

interface Props {
  userId: string;
  initialActive: boolean;
  currentTrust: number;
  isPro?: boolean;
  ownershipVerified?: boolean;
}

export function AdminUserActions({
  userId,
  initialActive,
  currentTrust,
  isPro = false,
  ownershipVerified = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [trustBusy, setTrustBusy] = useState(false);

  // Warning modal
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnSeverity, setWarnSeverity] = useState<"info" | "warning" | "severe">("warning");
  const [warnBody, setWarnBody] = useState("");
  const [warnBusy, setWarnBusy] = useState(false);

  // Ban modal
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<"1" | "7" | "30" | "perm">("perm");
  const [banScope, setBanScope] = useState<"full" | "bidding" | "selling" | "messaging">("full");
  const [banBusy, setBanBusy] = useState(false);

  // KYC reset modal
  const [kycResetOpen, setKycResetOpen] = useState(false);
  const [kycResetReason, setKycResetReason] = useState("");
  const [kycResetBusy, setKycResetBusy] = useState(false);

  // DM modal
  const [dmOpen, setDmOpen] = useState(false);
  const [dmTitle, setDmTitle] = useState("");
  const [dmBody, setDmBody] = useState("");
  const [dmBusy, setDmBusy] = useState(false);

  async function toggleActive() {
    if (busy) return;
    const next = !active;
    if (!next) {
      // Open the structured ban modal instead of a window.confirm.
      setBanOpen(true);
      return;
    }
    setBusy(true);
    const res = await unbanUserAction({
      userId,
      reason: "Réactivation manuelle",
    });
    setBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    setActive(true);
    toast("Compte réactivé", "success");
    router.refresh();
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

  async function submitWarning() {
    if (!warnBody.trim()) {
      toast("Le contenu de l'avertissement est obligatoire", "warning");
      return;
    }
    setWarnBusy(true);
    const res = await warnUserAction({
      userId,
      severity: warnSeverity,
      body: warnBody.trim(),
    });
    setWarnBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast("Avertissement envoyé", "success");
    setWarnOpen(false);
    setWarnBody("");
    setWarnSeverity("warning");
    router.refresh();
  }

  async function submitBan() {
    if (!banReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBanBusy(true);
    const durationDays = banDuration === "perm" ? null : Number(banDuration);
    const res = await banUserAction({
      userId,
      reason: banReason.trim(),
      scope: banScope,
      durationDays,
    });
    setBanBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    setActive(false);
    toast(
      durationDays
        ? `Compte suspendu ${durationDays} jours`
        : "Compte suspendu définitivement",
      "warning",
    );
    setBanOpen(false);
    setBanReason("");
    router.refresh();
  }

  async function submitKycReset() {
    if (!kycResetReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setKycResetBusy(true);
    const res = await resetKycAction({
      userId,
      reason: kycResetReason.trim(),
    });
    setKycResetBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast("KYC réinitialisé — l'utilisateur doit recommencer", "info");
    setKycResetOpen(false);
    setKycResetReason("");
    router.refresh();
  }

  async function togglePro() {
    const r = window.prompt(
      isPro
        ? "Raison du retrait du statut Pro :"
        : "Raison de la promotion en Pro :",
      "",
    );
    if (!r || !r.trim()) return;
    const res = await setProAction({ userId, value: !isPro, reason: r.trim() });
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast(isPro ? "Statut Pro retiré" : "Promu vendeur Pro", "success");
    router.refresh();
  }

  async function resetEmail() {
    const reason = window.prompt(
      "Forcer la re-vérification email :\nRaison (audit) :",
      "",
    );
    if (!reason || !reason.trim()) return;
    const r = await resetEmailVerificationAction({
      userId,
      reason: reason.trim(),
    });
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Vérification email réinitialisée", "info");
    router.refresh();
  }

  async function resetPhone() {
    const reason = window.prompt(
      "Forcer la re-vérification téléphone :\nRaison (audit) :",
      "",
    );
    if (!reason || !reason.trim()) return;
    const r = await resetPhoneVerificationAction({
      userId,
      reason: reason.trim(),
    });
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Vérification téléphone réinitialisée", "info");
    router.refresh();
  }

  async function submitDm() {
    if (!dmTitle.trim() || !dmBody.trim()) {
      toast("Titre + corps requis", "warning");
      return;
    }
    setDmBusy(true);
    const r = await dmUserAction({
      userId,
      title: dmTitle.trim(),
      body: dmBody.trim(),
    });
    setDmBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Message envoyé", "success");
    setDmOpen(false);
    setDmTitle("");
    setDmBody("");
    router.refresh();
  }

  async function toggleOwnership() {
    const r = window.prompt(
      ownershipVerified
        ? "Raison du retrait de la vérification de propriété :"
        : "Raison de la vérification manuelle de propriété :",
      "",
    );
    if (!r || !r.trim()) return;
    const res = await setOwnershipVerifiedAction({
      userId,
      value: !ownershipVerified,
      reason: r.trim(),
    });
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    toast(
      ownershipVerified ? "Vérification retirée" : "Propriété vérifiée",
      "success",
    );
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
        onClick={() => setWarnOpen(true)}
      >
        <AlertTriangle className="h-4 w-4" />
        Envoyer un avertissement
      </Button>

      <Button variant="secondary" size="md" onClick={() => setKycResetOpen(true)}>
        <KeyRound className="h-4 w-4" />
        Réinitialiser le KYC
      </Button>

      <Button variant="ghost" size="md" onClick={togglePro}>
        <Star className="h-4 w-4" />
        {isPro ? "Retirer Pro" : "Promouvoir Pro"}
      </Button>

      <Button variant="ghost" size="md" onClick={toggleOwnership}>
        <ShieldCheck className="h-4 w-4" />
        {ownershipVerified ? "Retirer vérif. propriété" : "Vérifier propriété"}
      </Button>

      <Button variant="ghost" size="md" onClick={resetEmail}>
        <Mail className="h-4 w-4" />
        Re-vérifier email
      </Button>

      <Button variant="ghost" size="md" onClick={resetPhone}>
        <Phone className="h-4 w-4" />
        Re-vérifier téléphone
      </Button>

      <Button variant="secondary" size="md" onClick={() => setDmOpen(true)}>
        <MessageSquare className="h-4 w-4" />
        Envoyer un message
      </Button>

      {/* ---------- DM modal ---------- */}
      <Modal
        open={dmOpen}
        onClose={() => setDmOpen(false)}
        title="Envoyer un message à l'utilisateur"
        description="Apparaît dans son centre de notifications. Pour des actions de modération avec consigne précise."
        mobileSheet={false}
      >
        <div className="space-y-3">
          <Input
            placeholder="Titre"
            value={dmTitle}
            onChange={(e) => setDmTitle(e.target.value)}
          />
          <textarea
            value={dmBody}
            onChange={(e) => setDmBody(e.target.value)}
            rows={4}
            placeholder="Corps du message"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setDmOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitDm} disabled={dmBusy}>
            {dmBusy ? "Envoi..." : "Envoyer"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Warning modal ---------- */}
      <Modal
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Envoyer un avertissement"
        description="L'avertissement sera enregistré au dossier et envoyé en notification à l'utilisateur."
        mobileSheet={false}
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Sévérité
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["info", "warning", "severe"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setWarnSeverity(s)}
                  className={`h-10 rounded-[var(--radius)] border text-sm font-bold transition-colors ${
                    warnSeverity === s
                      ? "bg-[var(--gold)] border-[var(--gold)] text-black"
                      : "bg-[var(--surface-2)] border-[var(--border)]"
                  }`}
                >
                  {s === "info" ? "Info" : s === "warning" ? "Avertissement" : "Sévère"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Message
            </label>
            <textarea
              value={warnBody}
              onChange={(e) => setWarnBody(e.target.value)}
              rows={4}
              placeholder="Expliquez clairement le problème et l'action attendue."
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setWarnOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitWarning} disabled={warnBusy}>
            {warnBusy ? "Envoi..." : "Envoyer"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Ban modal ---------- */}
      <Modal
        open={banOpen}
        onClose={() => setBanOpen(false)}
        title="Suspendre le compte"
        description="Les bans sont consignés et notifiés à l'utilisateur. Choisissez la portée et la durée."
        mobileSheet={false}
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Portée
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["full", "Complet"],
                  ["bidding", "Enchères seul."],
                  ["selling", "Vente seul."],
                  ["messaging", "Messagerie"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBanScope(k)}
                  className={`h-10 rounded-[var(--radius)] border text-sm transition-colors ${
                    banScope === k
                      ? "bg-red-500/15 border-red-500/50 text-red-200"
                      : "bg-[var(--surface-2)] border-[var(--border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Durée
            </label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {(
                [
                  ["1", "1 jour"],
                  ["7", "7 jours"],
                  ["30", "30 jours"],
                  ["perm", "Définitif"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBanDuration(k)}
                  className={`h-10 rounded-[var(--radius)] border text-sm font-bold transition-colors ${
                    banDuration === k
                      ? "bg-red-500/15 border-red-500/50 text-red-200"
                      : "bg-[var(--surface-2)] border-[var(--border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Raison (audit)
            </label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
              placeholder="Citez l'incident, le ticket support, ou la règle violée."
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setBanOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={submitBan}
            disabled={banBusy}
          >
            {banBusy ? "Suspension..." : "Suspendre"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---------- KYC reset modal ---------- */}
      <Modal
        open={kycResetOpen}
        onClose={() => setKycResetOpen(false)}
        title="Forcer la re-vérification KYC"
        description="L'utilisateur devra refaire la vérification d'identité depuis le début."
        mobileSheet={false}
      >
        <div className="space-y-4">
          <textarea
            value={kycResetReason}
            onChange={(e) => setKycResetReason(e.target.value)}
            rows={3}
            placeholder="Raison (visible par l'utilisateur)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setKycResetOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitKycReset} disabled={kycResetBusy}>
            {kycResetBusy ? "Réinit..." : "Réinitialiser"}
          </Button>
        </ModalFooter>
      </Modal>

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
