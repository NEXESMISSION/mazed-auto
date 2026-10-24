"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { RotateCw, Loader2 } from "lucide-react";

/**
 * Renew an expired annonce.
 *
 * The button says which way it will be paid before it is pressed — a credit
 * from the seller's forfait, or the fee — because "Renouveler" that silently
 * spends one of five prepaid publications is the kind of surprise that turns
 * into a support message.
 */
export function RenewButton({
  listingId,
  usesCredit,
  feeLabel,
}: {
  listingId: string;
  usesCredit: boolean;
  feeLabel: string | null;
}) {
  const t = useTranslations("myAccount");
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function renew() {
    setBusy(true);
    try {
      const res = await fetch(`/api/annonces/${listingId}/renew`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? j.error ?? t("listings.renew.failed"), "error");
        return;
      }
      if (j.status === "pending_payment" && j.paymentId) {
        router.push(`/payment/checkout?payment=${j.paymentId}` as never);
        return;
      }
      toast(t("listings.renew.done", { count: j.remaining ?? 0 }), "success");
      router.refresh();
    } catch {
      toast(t("common.networkError"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={renew}
      disabled={busy}
      className="tap-target mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-1.5 text-[12px] font-bold text-gold ring-1 ring-gold-soft transition hover:bg-gold-faint/70 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
      {t("listings.renew.button")}
      <span className="font-semibold opacity-80">
        · {usesCredit ? t("listings.renew.usesCredit") : feeLabel ?? t("listings.renew.paid")}
      </span>
    </button>
  );
}
