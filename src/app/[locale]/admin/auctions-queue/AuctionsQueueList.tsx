"use client";

import { useState } from "react";
import {
  Check,
  X,
  Edit,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";
import {
  requestAuctionEditAction,
  bulkApproveAuctionsAction,
  bulkRejectAuctionsAction,
} from "@/app/[locale]/admin/actions";

const EDITABLE_FIELDS = [
  { id: "photos", label: "Photos" },
  { id: "video", label: "Vidéo" },
  { id: "vehicle_data", label: "Données véhicule" },
  { id: "registration", label: "Carte grise" },
  { id: "pricing", label: "Tarification" },
  { id: "description", label: "Description" },
];

export function AuctionsQueueList({ initial }: { initial: Auction[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  // Edit-request modal state
  const [editTarget, setEditTarget] = useState<Auction | null>(null);
  const [editFields, setEditFields] = useState<string[]>([]);
  const [editMessage, setEditMessage] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Reject modal state (so we capture a reason instead of cancelling silently)
  const [rejectTarget, setRejectTarget] = useState<Auction | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    if (
      !window.confirm(`Approuver ${selected.size} enchères en bloc ?`)
    )
      return;
    setBulkBusy(true);
    const r = await bulkApproveAuctionsAction({
      auctionIds: Array.from(selected),
    });
    setBulkBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((arr) => arr.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    toast(`${r.data?.count ?? 0} enchères publiées`, "success");
  }

  async function bulkReject() {
    if (selected.size === 0) return;
    const reason = window.prompt(
      `Motif du refus en bloc (appliqué aux ${selected.size} enchères) :`,
      "",
    );
    if (!reason || !reason.trim()) return;
    setBulkBusy(true);
    const r = await bulkRejectAuctionsAction({
      auctionIds: Array.from(selected),
      reason: reason.trim(),
    });
    setBulkBusy(false);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((arr) => arr.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    toast(`${r.data?.count ?? 0} enchères refusées`, "warning");
  }

  async function approve(a: Auction) {
    setBusy(a.id);
    const supabase = createClient();
    const { data: row } = await supabase
      .from("auctions")
      .select("start_time, original_end_time")
      .eq("id", a.id)
      .maybeSingle();

    const now = new Date();
    let endTime = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    if (row?.start_time && row?.original_end_time) {
      const duration =
        new Date(row.original_end_time).getTime() -
        new Date(row.start_time).getTime();
      if (duration > 0) endTime = new Date(now.getTime() + duration);
    }

    const { error } = await supabase
      .from("auctions")
      .update({
        status: "active",
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        original_end_time: endTime.toISOString(),
      })
      .eq("id", a.id);

    // Notify the seller — uses the new approval kind so the user gets
    // a properly-typed banner (PLAN §23.2).
    await supabase.from("notifications").insert({
      user_id: a.seller.id,
      auction_id: a.id,
      kind: "approved",
      title: "Enchère approuvée",
      body: "Votre annonce est en ligne.",
    });

    setBusy(null);
    if (error) {
      toast("Échec de la publication : " + error.message, "error");
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== a.id));
    toast("Enchère publiée", "success");
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setRejectBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("auctions")
      .update({ status: "cancelled" })
      .eq("id", rejectTarget.id);
    if (!error) {
      await supabase.from("notifications").insert({
        user_id: rejectTarget.seller.id,
        auction_id: rejectTarget.id,
        kind: "rejected",
        title: "Enchère refusée",
        body: rejectReason.trim(),
      });
    }
    setRejectBusy(false);
    if (error) {
      toast("Échec du refus : " + error.message, "error");
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== rejectTarget.id));
    toast("Enchère refusée", "warning");
    setRejectTarget(null);
    setRejectReason("");
  }

  async function submitEditRequest() {
    if (!editTarget) return;
    if (!editMessage.trim()) {
      toast("Décrivez ce qui doit être modifié", "warning");
      return;
    }
    setEditBusy(true);
    const res = await requestAuctionEditAction({
      auctionId: editTarget.id,
      fields: editFields,
      message: editMessage.trim(),
    });
    setEditBusy(false);
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== editTarget.id));
    toast("Modification demandée — le vendeur a été notifié", "info");
    setEditTarget(null);
    setEditMessage("");
    setEditFields([]);
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-[var(--gold)]"
          >
            {selected.size === items.length && items.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selected.size === 0
              ? "Tout sélectionner"
              : selected.size === items.length
                ? "Tout désélectionner"
                : `${selected.size}/${items.length} sélectionnés`}
          </button>
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={bulkApprove} disabled={bulkBusy}>
                <Check className="h-4 w-4" />
                Approuver ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={bulkReject}
                disabled={bulkBusy}
              >
                <X className="h-4 w-4" />
                Refuser ({selected.size})
              </Button>
            </>
          )}
        </div>
      )}
      {items.map((a) => (
        <div
          key={a.id}
          className={`rounded-[var(--radius-md)] bg-[var(--surface)] border ${
            selected.has(a.id)
              ? "border-[var(--gold)]"
              : "border-[var(--border)]"
          } overflow-hidden`}
        >
          <div className="p-4 flex gap-3">
            <button
              type="button"
              onClick={() => toggleSel(a.id)}
              className="shrink-0 self-start mt-1 text-[var(--foreground-muted)] hover:text-[var(--gold)]"
              aria-label="Sélectionner"
            >
              {selected.has(a.id) ? (
                <CheckSquare className="h-5 w-5 text-[var(--gold)]" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(a.vehicle.imageUrls[0], { width: 220, quality: 60 })}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Par : {a.seller.displayName} • Trust {a.seller.trustScore}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div>
                  <span className="text-[var(--foreground-muted)]">
                    Prix de départ:
                  </span>{" "}
                  <span className="font-bold">
                    {formatPrice(a.startingPrice)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--foreground-muted)]">Durée:</span>{" "}
                  <span className="font-bold">7 jours</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  KYC
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  Propriété
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  12 photos
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  Vidéo
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  AI Pass
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] p-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost">
              <Eye className="h-4 w-4" />
              Aperçu
            </Button>
            <Button size="sm" onClick={() => approve(a)} disabled={busy === a.id}>
              <Check className="h-4 w-4" />
              Approuver et publier
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditTarget(a);
                setEditFields([]);
                setEditMessage("");
              }}
              disabled={busy === a.id}
            >
              <Edit className="h-4 w-4" />
              Demander modification
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setRejectTarget(a);
                setRejectReason("");
              }}
              disabled={busy === a.id}
            >
              <X className="h-4 w-4" />
              Refuser
            </Button>
          </div>
        </div>
      ))}

      {/* ---------- Edit-request modal ---------- */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Demander une modification"
        description={
          editTarget
            ? `${editTarget.vehicle.make} ${editTarget.vehicle.model} ${editTarget.vehicle.year}`
            : ""
        }
        mobileSheet={false}
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Champs concernés
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {EDITABLE_FIELDS.map((f) => {
                const on = editFields.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      setEditFields((prev) =>
                        on ? prev.filter((x) => x !== f.id) : [...prev, f.id],
                      )
                    }
                    className={`h-9 rounded-[var(--radius)] border text-xs transition-colors ${
                      on
                        ? "bg-[var(--gold)] border-[var(--gold)] text-black font-bold"
                        : "bg-[var(--surface-2)] border-[var(--border)]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              Message au vendeur
            </label>
            <textarea
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              rows={4}
              placeholder="Précisez ce qui doit être corrigé pour que l'annonce soit acceptée."
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setEditTarget(null)}>
            Annuler
          </Button>
          <Button size="md" onClick={submitEditRequest} disabled={editBusy}>
            {editBusy ? "Envoi..." : "Envoyer la demande"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Reject modal ---------- */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Refuser cette enchère"
        description={
          rejectTarget
            ? `${rejectTarget.vehicle.make} ${rejectTarget.vehicle.model} ${rejectTarget.vehicle.year}`
            : ""
        }
        mobileSheet={false}
      >
        <div className="space-y-3">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="Raison du refus (transmise au vendeur)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setRejectTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={submitReject}
            disabled={rejectBusy}
          >
            {rejectBusy ? "Refus..." : "Refuser"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
