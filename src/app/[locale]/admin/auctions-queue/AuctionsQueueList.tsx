"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  X,
  Edit,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
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

// Stable identifiers for the editable-fields multi-select; labels resolve
// via useTranslations("admin.auctionsQueue.editField*") at render time.
const EDITABLE_FIELD_IDS = [
  { id: "photos", labelKey: "editFieldPhotos" as const },
  { id: "video", labelKey: "editFieldVideo" as const },
  { id: "vehicle_data", labelKey: "editFieldVehicleData" as const },
  { id: "registration", labelKey: "editFieldRegistration" as const },
  { id: "pricing", labelKey: "editFieldPricing" as const },
  { id: "description", labelKey: "editFieldDescription" as const },
];

export function AuctionsQueueList({ initial }: { initial: Auction[] }) {
  const { toast } = useToast();
  const t = useTranslations("admin.auctionsQueue");
  const tCommon = useTranslations("common");
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
    if (!window.confirm(t("bulkApproveConfirm", { count: selected.size })))
      return;
    setBulkBusy(true);
    const r = await bulkApproveAuctionsAction({
      auctionIds: Array.from(selected),
    });
    setBulkBusy(false);
    if (!r.ok) {
      toast(t("toastFailed", { error: r.error }), "error");
      return;
    }
    setItems((arr) => arr.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    toast(t("toastBulkApproved", { count: r.data?.count ?? 0 }), "success");
  }

  async function bulkReject() {
    if (selected.size === 0) return;
    const reason = window.prompt(
      t("bulkRejectPrompt", { count: selected.size }),
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
      toast(t("toastFailed", { error: r.error }), "error");
      return;
    }
    setItems((arr) => arr.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    toast(t("toastBulkRejected", { count: r.data?.count ?? 0 }), "warning");
  }

  async function approve(a: Auction) {
    setBusy(a.id);
    // Approval (auction status flip + seller notification) is delegated
    // to the SECURITY DEFINER RPC `admin_bulk_approve_auctions`. The
    // RPC re-checks the admin capability, clamps the duration, dedupes
    // the seller notification, and audit-logs the action. Client-side
    // INSERT into notifications is now blocked by RLS, so this path is
    // the only safe way to publish (audit NOTIF-1 + #6).
    const res = await bulkApproveAuctionsAction({ auctionIds: [a.id] });
    if (!res.ok) {
      setBusy(null);
      toast(t("toastApproveFailed", { error: res.error }), "error");
      return;
    }

    // Fetch the row separately for boost-fee charging below. The RPC
    // doesn't need this; only the fee step does, and that's a separate
    // concern from auction publication.
    const supabase = createClient();
    const { data: row } = await supabase
      .from("auctions")
      .select("is_featured, is_vip, seller_id")
      .eq("id", a.id)
      .maybeSingle();

    // Charge boost fees on approval (deferred from publish so a rejected
    // auction never pays). Reads the current settings + the seller's
    // active plan discount; both are admin-tunable.
    if (row?.is_featured || row?.is_vip) {
      try {
        const { data: feeRows } = await supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", [
            "auction.featured_listing_fee",
            "auction.vip_listing_fee",
          ]);
        const feeBy = new Map<string, number>(
          (feeRows ?? []).map((r) => [
            r.key as string,
            Number(r.value as unknown as number),
          ]),
        );
        let discountPct = 0;
        const { data: subRow } = await supabase
          .from("user_active_subscription")
          .select("plan_slug")
          .eq("user_id", a.seller.id)
          .maybeSingle();
        if (subRow?.plan_slug) {
          const { data: planRow } = await supabase
            .from("cms_subscription_plans")
            .select("featured_listing_discount_pct")
            .eq("slug", subRow.plan_slug)
            .maybeSingle();
          const pct = Number(planRow?.featured_listing_discount_pct ?? 0);
          if (Number.isFinite(pct)) discountPct = pct;
        }
        const apply = (n: number) =>
          Math.max(0, Math.round(n * (1 - discountPct / 100)));
        const txRows: Array<Record<string, unknown>> = [];
        if (row.is_featured) {
          const fee = apply(feeBy.get("auction.featured_listing_fee") ?? 50);
          if (fee > 0)
            txRows.push({
              ref: `TX-BF-${crypto.randomUUID().slice(0, 8)}`,
              user_id: a.seller.id,
              auction_id: a.id,
              type: "commission",
              direction: "out",
              amount: fee,
              label: "Boost « En vedette »",
              status: "completed",
            });
        }
        if (row.is_vip) {
          const fee = apply(feeBy.get("auction.vip_listing_fee") ?? 200);
          if (fee > 0)
            txRows.push({
              ref: `TX-BV-${crypto.randomUUID().slice(0, 8)}`,
              user_id: a.seller.id,
              auction_id: a.id,
              type: "commission",
              direction: "out",
              amount: fee,
              label: "Boost « VIP »",
              status: "completed",
            });
        }
        if (txRows.length > 0) {
          await supabase.from("transactions").insert(txRows);
        }
      } catch {
        // Non-fatal — admin can manually re-charge from /admin/transactions.
      }
    }

    setBusy(null);
    setItems((arr) => arr.filter((x) => x.id !== a.id));
    toast(t("toastApproved"), "success");
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast(t("toastReasonRequired"), "warning");
      return;
    }
    setRejectBusy(true);
    // Rejection (status flip to "cancelled" + seller notification) is
    // delegated to the SECURITY DEFINER RPC `admin_bulk_reject_auctions`
    // for the same reason as approve(): client-side INSERT into
    // notifications is blocked by RLS, and the RPC re-checks admin
    // capability + dedupes + audit-logs.
    const res = await bulkRejectAuctionsAction({
      auctionIds: [rejectTarget.id],
      reason: rejectReason.trim(),
    });
    setRejectBusy(false);
    if (!res.ok) {
      toast(t("toastRejectFailed", { error: res.error }), "error");
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== rejectTarget.id));
    toast(t("toastRejected"), "warning");
    setRejectTarget(null);
    setRejectReason("");
  }

  async function submitEditRequest() {
    if (!editTarget) return;
    if (!editMessage.trim()) {
      toast(t("toastEditDescribe"), "warning");
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
      toast(t("toastFailed", { error: res.error }), "error");
      return;
    }
    setItems((arr) => arr.filter((x) => x.id !== editTarget.id));
    toast(t("toastEditRequested"), "info");
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
              ? t("selectAll")
              : selected.size === items.length
                ? t("deselectAll")
                : t("selectedCount", {
                    selected: selected.size,
                    total: items.length,
                  })}
          </button>
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={bulkApprove} disabled={bulkBusy}>
                <Check className="h-4 w-4" />
                {t("bulkApprove", { count: selected.size })}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={bulkReject}
                disabled={bulkBusy}
              >
                <X className="h-4 w-4" />
                {t("bulkReject", { count: selected.size })}
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
              aria-label={t("selectAria")}
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
              alt={`${a.vehicle.make} ${a.vehicle.model} ${a.vehicle.year}`}
              loading="lazy"
              decoding="async"
              className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {t("byLabel", {
                  name: a.seller.displayName,
                  trust: a.seller.trustScore,
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div>
                  <span className="text-[var(--foreground-muted)]">
                    {t("startingPriceLabel")}
                  </span>{" "}
                  <span className="font-bold">
                    {formatPrice(a.startingPrice)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--foreground-muted)]">
                    {t("durationLabel")}
                  </span>{" "}
                  <span className="font-bold">
                    {t("daysDuration", { count: 7 })}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  {t("badgeKyc")}
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  {t("badgeOwnership")}
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  {t("badgePhotos")}
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  {t("badgeVideo")}
                </Badge>
                <Badge variant="success" size="sm">
                  <Check className="h-3 w-3" />
                  {t("badgeAiPass")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] p-3 flex flex-wrap gap-2">
            <Link
              href={`/admin/auctions/${a.id}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors"
            >
              <Eye className="h-4 w-4" />
              {t("preview")}
            </Link>
            <Link
              href={`/auctions/${a.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors"
            >
              <Eye className="h-4 w-4" />
              {t("publicView")}
            </Link>
            <Button size="sm" onClick={() => approve(a)} disabled={busy === a.id}>
              <Check className="h-4 w-4" />
              {t("approveAndPublish")}
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
              {t("requestEdit")}
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
              {t("rejectAction")}
            </Button>
          </div>
        </div>
      ))}

      {/* ---------- Edit-request modal ---------- */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={t("editModalTitle")}
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
              {t("editFieldsLabel")}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {EDITABLE_FIELD_IDS.map((f) => {
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
                    {t(f.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
              {t("editMessageLabel")}
            </label>
            <textarea
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              rows={4}
              placeholder={t("editMessagePlaceholder")}
              className="mt-1.5 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setEditTarget(null)}>
            {tCommon("cancel")}
          </Button>
          <Button size="md" onClick={submitEditRequest} disabled={editBusy}>
            {editBusy ? t("editSending") : t("editSendCta")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Reject modal ---------- */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={t("rejectModalTitle")}
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
            placeholder={t("rejectReasonPlaceholder")}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setRejectTarget(null)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={submitReject}
            disabled={rejectBusy}
          >
            {rejectBusy ? t("rejectingState") : t("rejectAction")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
