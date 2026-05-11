"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Clock, ExternalLink, Check, X } from "lucide-react";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import type { Auction } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { forceSellerDecisionAction } from "@/app/[locale]/admin/actions";

interface Props {
  items: Auction[];
}

/**
 * Visibility list of auctions sitting in `pending_seller_decision`.
 * Past-deadline rows are auto-resolved by the cron, but admins can
 * force-resolve at any time via `admin_force_seller_decision`.
 */
export function PendingDecisionList({ items }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("admin.pendingDecision");
  const tCommon = useTranslations("common");
  const [target, setTarget] = useState<{
    auction: Auction;
    choice: "accept" | "reject";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Tick once a minute so the "{n} h restantes" / "Dépassé" badge stays
  // live without polling the server. Initialised lazily inside the
  // effect so the first render is pure (Date.now() during render is
  // flagged by react-hooks/purity). The setNow inside the effect is the
  // canonical "sync external clock into React" pattern.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearInterval(id);
  }, []);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast(t("toastReasonRequired"), "warning");
      return;
    }
    setBusy(true);
    const res = await forceSellerDecisionAction({
      auctionId: target.auction.id,
      choice: target.choice,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      toast(t("toastFailed", { error: res.error }), "error");
      return;
    }
    toast(
      target.choice === "accept" ? t("toastAccepted") : t("toastRejected"),
      "success",
    );
    setTarget(null);
    setReason("");
    router.refresh();
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((a) => {
        const deadline = a.reserveDecisionDeadline;
        // `now` is `null` on the first SSR / pre-effect paint — render
        // without the time-left badge for that frame, then it appears
        // (and updates every minute) once the effect kicks in.
        const overdue =
          deadline !== undefined && now !== null && deadline.getTime() <= now;
        const hoursLeft =
          deadline && now !== null
            ? Math.max(
                0,
                Math.floor((deadline.getTime() - now) / (1000 * 60 * 60)),
              )
            : null;
        return (
          <div
            key={a.id}
            className={`rounded-[var(--radius-md)] bg-[var(--surface)] border ${overdue ? "border-red-500/40" : "border-amber-500/40"} overflow-hidden`}
          >
            <div className="p-4 flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb(a.vehicle.imageUrls[0], { width: 220, quality: 60 })}
                alt={`${a.vehicle.make} ${a.vehicle.model} ${a.vehicle.year}`}
                className="h-20 w-28 rounded-[var(--radius-sm)] object-cover shrink-0"
                loading="lazy"
                decoding="async"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm leading-tight line-clamp-1">
                    {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
                  </h3>
                  <span className="text-[10px] font-mono font-bold tracking-[0.05em] text-[var(--foreground-subtle)] tabular-nums">
                    {auctionCode(a.id)}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                      {t("highestBid")}
                    </div>
                    <div className="font-extrabold text-[var(--gold)] tabular-nums text-[13px]">
                      {formatPrice(a.currentPrice)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--foreground-muted)] uppercase tracking-wider text-[9px]">
                      {t("reserveLabel")}
                    </div>
                    <div className="font-bold tabular-nums text-[13px]">
                      {a.reservePrice
                        ? formatPrice(a.reservePrice)
                        : "—"}
                    </div>
                  </div>
                </div>
                {hoursLeft !== null && (
                  <div
                    className={`mt-2 inline-flex items-center gap-1.5 text-[11px] ${
                      overdue ? "text-red-300" : "text-amber-300"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums font-bold">
                      {overdue
                        ? t("overdue")
                        : hoursLeft >= 24
                          ? t("daysAndHours", {
                              days: Math.floor(hoursLeft / 24),
                              hours: hoursLeft % 24,
                            })
                          : t("hoursLeft", { hours: hoursLeft })}
                    </span>
                  </div>
                )}
              </div>
              <Link
                href={`/auctions/${a.id}`}
                target="_blank"
                rel="noopener"
                className="shrink-0 h-8 w-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
                aria-label={t("openAria")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="border-t border-[var(--border)] p-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTarget({ auction: a, choice: "accept" });
                  setReason("");
                }}
              >
                <Check className="h-4 w-4" />
                {t("forceAccept")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTarget({ auction: a, choice: "reject" });
                  setReason("");
                }}
              >
                <X className="h-4 w-4" />
                {t("forceReject")}
              </Button>
            </div>
          </div>
        );
      })}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.choice === "accept"
            ? t("forceAcceptTitle")
            : t("forceRejectTitle")
        }
        description={t("auditNotice")}
        mobileSheet={false}
      >
        <div className="space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("reasonPlaceholder")}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setTarget(null)}>
            {tCommon("cancel")}
          </Button>
          <Button size="md" onClick={submit} disabled={busy}>
            {busy ? t("submitting") : t("confirm")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
