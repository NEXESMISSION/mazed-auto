"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

/**
 * The buyer is back from paying. Coming back is not proof of payment
 * (recette 6): this asks the server, which asks the provider, and shows
 * whatever that answer is — a few tries a few seconds apart, because
 * Konnect's confirmation can trail the redirect.
 */
export function PaymentStatus({ paymentId }: { paymentId: string }) {
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
        <Loader2 className="size-4 animate-spin" /> Vérification de votre paiement…
      </p>
    );
  }
  if (status === "captured") {
    return (
      <p className="batta-tone-ok flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
        <CheckCircle2 className="size-4" /> Paiement confirmé.{" "}
        {kind === "promo" ? "Votre annonce est sponsorisée." : "Votre abonnement est actif."}
      </p>
    );
  }
  if (status === "pending" || status === "pending_review") {
    return (
      <p className="batta-tone-warn flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
        <Clock className="size-4" /> Paiement en cours de vérification. Rien n&apos;est activé tant qu&apos;il n&apos;est pas confirmé ;
        cette page se met à jour toute seule.
      </p>
    );
  }
  return (
    <p className="batta-tone-bad flex items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
      <XCircle className="size-4" /> Ce paiement n&apos;a pas abouti. Vous pouvez recommencer ci-dessous.
    </p>
  );
}
