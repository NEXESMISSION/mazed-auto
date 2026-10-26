"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { CheckCircle2, Clock, Loader2, Send, XCircle } from "lucide-react";

/**
 * The buyer is back from paying. Coming back is not proof of payment
 * (recette 6): this asks the server, which asks the provider, and shows
 * whatever that answer is — a few tries a few seconds apart, because
 * Konnect's confirmation can trail the redirect.
 */
export function PaymentStatus({
  paymentId,
  draftWaiting = false,
}: {
  paymentId: string;
  /** A personal annonce held back by the limit can now go out through this shop. */
  draftWaiting?: boolean;
}) {
  const t = useTranslations("pro.paymentStatus");
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/pro/payments/${paymentId}/verify`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { status?: string; kind?: string };
        if (stop) return;
        setStatus(j.status ?? "unknown");
        setKind(j.kind ?? null);
        if (j.status === "captured") router.refresh();
        else if ((j.status === "pending" || j.status === "pending_review") && tries < 4) {
          setTimeout(() => !stop && setTries((t) => t + 1), 4000);
        }
      } catch {
        if (!stop) setStatus("unknown");
      }
    };
    void check();
    return () => {
      stop = true;
    };
  }, [paymentId, tries, router]);

  if (status === null) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] ring-1 ring-border">
        <Loader2 className="size-4 animate-spin" /> {t("checking")}
      </p>
    );
  }
  if (status === "captured") {
    return (
      <div className="space-y-2">
        <p className="batta-tone-ok flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
          <CheckCircle2 className="size-4" /> {t("confirmed")}{" "}
          {kind === "promo" ? t("sponsored") : t("active")}
        </p>
        {draftWaiting && kind !== "promo" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] ring-1 ring-border">
            <span className="min-w-[13rem] flex-1">{t("draftWaiting")}</span>
            <Link
              href="/annonces/nouvelle"
              className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-4 py-2.5 text-[12.5px]"
            >
              <Send className="size-4 shrink-0 rtl:-scale-x-100" strokeWidth={2.2} />
              {t("publishDraft")}
            </Link>
          </div>
        )}
      </div>
    );
  }
  if (status === "pending" || status === "pending_review") {
    return (
      <p className="batta-tone-warn flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
        <Clock className="size-4" /> {t("pending")}
      </p>
    );
  }
  return (
    <p className="batta-tone-bad flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
      <XCircle className="size-4" /> {t("failed")}
    </p>
  );
}
