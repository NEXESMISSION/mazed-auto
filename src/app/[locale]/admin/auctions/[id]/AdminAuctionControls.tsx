"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Star,
  Crown,
  Ban,
  TimerOff,
  Plus,
  Edit3,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  setAuctionFeaturedAction,
  setAuctionVipAction,
  forceCancelAuctionAction,
  forceEndAuctionAction,
  extendAuctionEndAction,
  requestAuctionEditAction,
  editAuctionAction,
} from "@/app/[locale]/admin/actions";

interface Props {
  auctionId: string;
  status: string;
  isFeatured: boolean;
  isVip: boolean;
  totalBids: number;
  initialEditable: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    color: string;
    description: string | null;
    city: string;
    region: string;
    starting_price: number;
    reserve_price: number | null;
    buy_now_price: number | null;
    end_time: string;
  };
}

export function AdminAuctionControls({
  auctionId,
  status,
  isFeatured,
  isVip,
  totalBids,
  initialEditable,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState(isFeatured);
  const [vip, setVip] = useState(isVip);

  const [extendOpen, setExtendOpen] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState("30");
  const [extendReason, setExtendReason] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  // Direct admin edit modal (full field patch)
  const [forceEditOpen, setForceEditOpen] = useState(false);
  const [feMake, setFeMake] = useState(initialEditable.make);
  const [feModel, setFeModel] = useState(initialEditable.model);
  const [feYear, setFeYear] = useState(String(initialEditable.year));
  const [feMileage, setFeMileage] = useState(String(initialEditable.mileage));
  const [feColor, setFeColor] = useState(initialEditable.color);
  const [feDescription, setFeDescription] = useState(
    initialEditable.description ?? "",
  );
  const [feCity, setFeCity] = useState(initialEditable.city);
  const [feRegion, setFeRegion] = useState(initialEditable.region);
  const [feStarting, setFeStarting] = useState(
    String(initialEditable.starting_price),
  );
  const [feReserve, setFeReserve] = useState(
    initialEditable.reserve_price !== null
      ? String(initialEditable.reserve_price)
      : "",
  );
  const [feBuyNow, setFeBuyNow] = useState(
    initialEditable.buy_now_price !== null
      ? String(initialEditable.buy_now_price)
      : "",
  );
  const [feEnd, setFeEnd] = useState(
    new Date(initialEditable.end_time).toISOString().slice(0, 16),
  );
  const [feReason, setFeReason] = useState("");

  async function toggleFeatured() {
    setBusy(true);
    const r = await setAuctionFeaturedAction({
      auctionId,
      featured: !featured,
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setFeatured(!featured);
    toast(featured ? "Featured retiré" : "Featured activé", "success");
    router.refresh();
  }

  async function toggleVip() {
    setBusy(true);
    const r = await setAuctionVipAction({ auctionId, vip: !vip });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setVip(!vip);
    toast(vip ? "VIP retiré" : "VIP activé", "success");
    router.refresh();
  }

  async function submitExtend() {
    const m = Number(extendMinutes);
    if (!Number.isFinite(m) || m <= 0) {
      toast("Minutes > 0", "warning");
      return;
    }
    setBusy(true);
    const r = await extendAuctionEndAction({
      auctionId,
      minutes: m,
      reason: extendReason.trim() || "ajustement administratif",
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast(`Fin prolongée de ${m} min`, "success");
    setExtendOpen(false);
    setExtendMinutes("30");
    setExtendReason("");
    router.refresh();
  }

  async function submitCancel() {
    if (!cancelReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(true);
    const r = await forceCancelAuctionAction({
      auctionId,
      reason: cancelReason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Enchère annulée — cautions remboursées", "warning");
    setCancelOpen(false);
    setCancelReason("");
    router.refresh();
  }

  async function submitForceEnd() {
    const reason = window.prompt("Raison de la clôture forcée :", "");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    const r = await forceEndAuctionAction({
      auctionId,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Enchère close immédiatement", "warning");
    router.refresh();
  }

  async function submitEditRequest() {
    if (!editMessage.trim()) {
      toast("Message requis", "warning");
      return;
    }
    setBusy(true);
    const r = await requestAuctionEditAction({
      auctionId,
      fields: [],
      message: editMessage.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast("Demande envoyée au vendeur", "info");
    setEditOpen(false);
    setEditMessage("");
    router.refresh();
  }

  async function submitForceEdit() {
    if (!feReason.trim()) {
      toast("Une raison est obligatoire (audit)", "warning");
      return;
    }
    // Build a patch with only fields the admin actually changed.
    const patch: Record<string, unknown> = {};
    const num = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };
    if (feMake !== initialEditable.make) patch.make = feMake;
    if (feModel !== initialEditable.model) patch.model = feModel;
    if (num(feYear) !== initialEditable.year) patch.year = num(feYear);
    if (num(feMileage) !== initialEditable.mileage)
      patch.mileage = num(feMileage);
    if (feColor !== initialEditable.color) patch.color = feColor;
    if ((feDescription || null) !== (initialEditable.description ?? null))
      patch.description = feDescription || null;
    if (feCity !== initialEditable.city) patch.city = feCity;
    if (feRegion !== initialEditable.region) patch.region = feRegion;
    if (num(feStarting) !== initialEditable.starting_price)
      patch.starting_price = num(feStarting);
    const newReserve =
      feReserve.trim() === "" ? null : Number(feReserve);
    if (newReserve !== initialEditable.reserve_price)
      patch.reserve_price = newReserve;
    const newBuyNow =
      feBuyNow.trim() === "" ? null : Number(feBuyNow);
    if (newBuyNow !== initialEditable.buy_now_price)
      patch.buy_now_price = newBuyNow;
    const newEnd = new Date(feEnd).toISOString();
    if (newEnd !== new Date(initialEditable.end_time).toISOString())
      patch.end_time = newEnd;

    if (Object.keys(patch).length === 0) {
      toast("Aucun champ modifié", "warning");
      return;
    }

    setBusy(true);
    const r = await editAuctionAction({
      auctionId,
      patch,
      reason: feReason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast(`Mis à jour (${Object.keys(patch).length} champs)`, "success");
    setForceEditOpen(false);
    setFeReason("");
    router.refresh();
  }

  const canCancel =
    status === "active" || status === "ending" || status === "scheduled";
  const canForceEnd = status === "active" || status === "ending";

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <h2 className="text-base font-bold">Contrôles administrateur</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={featured ? "primary" : "secondary"}
          onClick={toggleFeatured}
          disabled={busy}
        >
          <Star className="h-4 w-4" />
          {featured ? "Retirer Featured" : "Marquer Featured"}
        </Button>
        <Button
          size="sm"
          variant={vip ? "primary" : "secondary"}
          onClick={toggleVip}
          disabled={busy}
        >
          <Crown className="h-4 w-4" />
          {vip ? "Retirer VIP" : "Marquer VIP"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setExtendOpen(true)}
          disabled={busy || !canForceEnd}
        >
          <Plus className="h-4 w-4" />
          Prolonger
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditOpen(true)}
          disabled={busy}
        >
          <Edit3 className="h-4 w-4" />
          Demander modification
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setForceEditOpen(true)}
          disabled={busy}
        >
          <Wrench className="h-4 w-4" />
          Modifier directement
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={submitForceEnd}
          disabled={busy || !canForceEnd}
        >
          <TimerOff className="h-4 w-4" />
          Forcer la clôture
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => setCancelOpen(true)}
          disabled={busy || !canCancel}
        >
          <Ban className="h-4 w-4" />
          {totalBids > 0 ? "Annuler (rembourser)" : "Annuler"}
        </Button>
      </div>

      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Prolonger la fin de l'enchère"
        mobileSheet={false}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Minutes à ajouter
            </label>
            <Input
              type="number"
              value={extendMinutes}
              onChange={(e) => setExtendMinutes(e.target.value)}
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
          <Button variant="ghost" size="md" onClick={() => setExtendOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitExtend} disabled={busy}>
            Prolonger
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Annuler l'enchère"
        description={
          totalBids > 0
            ? `${totalBids} offres déjà placées. Toutes les cautions seront automatiquement remboursées.`
            : "Aucune offre. L'enchère sera marquée annulée."
        }
        mobileSheet={false}
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
          placeholder="Raison (transmise aux enchérisseurs et au vendeur)"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setCancelOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={submitCancel}
            disabled={busy}
          >
            Confirmer l'annulation
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Demander une modification"
        mobileSheet={false}
      >
        <textarea
          value={editMessage}
          onChange={(e) => setEditMessage(e.target.value)}
          rows={4}
          placeholder="Décrivez ce qui doit être corrigé."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setEditOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitEditRequest} disabled={busy}>
            Envoyer
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={forceEditOpen}
        onClose={() => setForceEditOpen(false)}
        title="Modifier directement l'enchère"
        description="Pour les corrections rapides (typos, photos, prix). Toutes les modifications sont consignées au journal d'audit avec un diff complet."
        mobileSheet={false}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <FieldLabel label="Marque">
              <Input value={feMake} onChange={(e) => setFeMake(e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Modèle">
              <Input value={feModel} onChange={(e) => setFeModel(e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Année">
              <Input
                type="number"
                value={feYear}
                onChange={(e) => setFeYear(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="Kilométrage">
              <Input
                type="number"
                value={feMileage}
                onChange={(e) => setFeMileage(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="Couleur">
              <Input value={feColor} onChange={(e) => setFeColor(e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Ville">
              <Input value={feCity} onChange={(e) => setFeCity(e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Région">
              <Input value={feRegion} onChange={(e) => setFeRegion(e.target.value)} />
            </FieldLabel>
            <FieldLabel label="Prix de départ">
              <Input
                type="number"
                value={feStarting}
                onChange={(e) => setFeStarting(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="Réserve (vide = aucune)">
              <Input
                type="number"
                value={feReserve}
                onChange={(e) => setFeReserve(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="Buy-now (vide = aucune)">
              <Input
                type="number"
                value={feBuyNow}
                onChange={(e) => setFeBuyNow(e.target.value)}
              />
            </FieldLabel>
          </div>
          <FieldLabel label="Description">
            <textarea
              value={feDescription}
              onChange={(e) => setFeDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </FieldLabel>
          <FieldLabel label="Fin (datetime-local)">
            <Input
              type="datetime-local"
              value={feEnd}
              onChange={(e) => setFeEnd(e.target.value)}
            />
          </FieldLabel>
          <FieldLabel label="Raison (audit)">
            <textarea
              value={feReason}
              onChange={(e) => setFeReason(e.target.value)}
              rows={2}
              placeholder="Ex : correction typo modèle suite ticket support #4321"
              className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </FieldLabel>
        </div>
        <ModalFooter>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setForceEditOpen(false)}
          >
            Annuler
          </Button>
          <Button size="md" onClick={submitForceEdit} disabled={busy}>
            Appliquer
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
