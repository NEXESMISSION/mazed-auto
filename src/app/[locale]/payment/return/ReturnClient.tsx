"use client";

// Client island for /payment/return. AppShell is rendered by the
// server page.tsx around this component — see settings/SettingsClient
// for the same pattern.

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Status =
  | "loading"
  | "pending_payment"
  | "active"
  | "expired"
  | "cancelled";

interface PollResponse {
  ok: boolean;
  error?: string;
  status?: string;
  plan_name?: string;
  failed_reason?: string;
  activated_at?: string | null;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

export function ReturnClient() {
  const params = useSearchParams();
  const subId = params.get("sub");
  const failedFromProvider = params.get("failed") === "1";
  const simulated = params.get("simulated") === "1";

  // Derive the initial state synchronously from URL params so the
  // first paint is right (no flicker into "loading" only to switch).
  const initialState: { status: Status; reason: string | null } = !subId
    ? { status: "expired", reason: "Lien de retour invalide." }
    : failedFromProvider
      ? { status: "expired", reason: "Paiement annulé ou refusé." }
      : { status: "loading", reason: null };

  const [status, setStatus] = useState<Status>(initialState.status);
  const [planName, setPlanName] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(
    initialState.reason,
  );

  useEffect(() => {
    // Nothing to poll if we already resolved synchronously.
    if (!subId || failedFromProvider) return;

    let cancelled = false;
    const startedAt = Date.now();

    async function poll() {
      try {
        const url = new URL(
          `/api/subscriptions/status`,
          window.location.origin,
        );
        url.searchParams.set("sub", subId!);
        if (simulated) url.searchParams.set("simulated", "1");
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json()) as PollResponse;
        if (cancelled) return;
        if (!data.ok) {
          setStatus("expired");
          setErrorReason(data.error ?? "Erreur inconnue");
          return;
        }
        const s = (data.status ?? "loading") as Status;
        setPlanName(data.plan_name ?? null);
        setStatus(s);
        if (data.failed_reason) setErrorReason(data.failed_reason);

        if (s === "pending_payment") {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) return;
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("expired");
        setErrorReason(e instanceof Error ? e.message : "Erreur réseau");
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [subId, simulated, failedFromProvider]);

  return (
    <div className="px-4 py-12 max-w-md mx-auto">
        {status === "loading" || status === "pending_payment" ? (
          <Card
            tone="info"
            icon={<Loader2 className="h-7 w-7 animate-spin" />}
            title="Vérification du paiement…"
            body="Nous attendons la confirmation du fournisseur de paiement. Cela prend généralement quelques secondes."
          />
        ) : status === "active" ? (
          <Card
            tone="success"
            icon={<CheckCircle2 className="h-7 w-7" />}
            title={
              planName
                ? `Plan « ${planName} » activé`
                : "Abonnement activé"
            }
            body="Vos avantages Pro sont disponibles immédiatement."
            cta={
              <Link href="/profile/subscription">
                <Button size="lg">
                  Voir mon abonnement
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            }
          />
        ) : (
          <Card
            tone="danger"
            icon={<AlertTriangle className="h-7 w-7" />}
            title="Paiement non finalisé"
            body={
              errorReason
                ? `Détail : ${errorReason}`
                : "Le paiement n'a pas pu être confirmé. Vous pouvez réessayer ou contacter le support."
            }
            cta={
              <div className="flex flex-col gap-2 w-full">
                <Link href="/pricing">
                  <Button size="lg" fullWidth>
                    Réessayer
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="md" fullWidth variant="ghost">
                    Contacter le support
                  </Button>
                </Link>
              </div>
            }
          />
        )}
    </div>
  );
}

function Card({
  tone,
  icon,
  title,
  body,
  cta,
}: {
  tone: "info" | "success" | "danger";
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  const ring =
    tone === "success"
      ? "border-emerald-500/40 ring-emerald-500/20"
      : tone === "danger"
        ? "border-red-500/40 ring-red-500/20"
        : "border-[var(--gold-soft)] ring-[var(--gold)]/20";
  const iconBg =
    tone === "success"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "danger"
        ? "bg-red-500/15 text-red-400"
        : "bg-[var(--gold-faint)] text-[var(--gold)]";
  return (
    <div
      className={`rounded-2xl bg-[var(--surface)] border-2 ${ring} ring-1 p-6 text-center space-y-4`}
    >
      <div
        className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-2">
          {body}
        </p>
      </div>
      {cta && <div className="pt-2">{cta}</div>}
    </div>
  );
}
