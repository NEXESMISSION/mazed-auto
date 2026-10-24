"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { EyeOff, Loader2 } from "lucide-react";

/**
 * « Retirer » — takes a live annonce off the catalogue. Asks once, because it
 * is visible to buyers immediately; nothing is deleted and « Renouveler »
 * brings it back.
 */
export function WithdrawButton({ listingId, title }: { listingId: string; title: string }) {
  const t = useTranslations("myAccount");
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!window.confirm(t("listings.withdraw.confirm", { title }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/annonces/${listingId}/archive`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.detail ?? t("listings.withdraw.failed"), "error");
        return;
      }
      toast(t("listings.withdraw.done"), "success");
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
      onClick={withdraw}
      disabled={busy}
      className="tap-target inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-muted transition hover:border-gold-soft hover:text-foreground disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <EyeOff className="size-3.5" />}
      {t("listings.withdraw.button")}
    </button>
  );
}
