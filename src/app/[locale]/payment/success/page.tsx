"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  ArrowRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/lib/auth";

// Once recording succeeds for a deposit-with-auction payment, we hold the
// success view for this long before deep-linking the user back into the
// auction. Long enough to read the confirmation, short enough to feel
// snappy. User can override via the "Commencer l'enchère" button at any time.
const AUTO_REDIRECT_MS = 1800;

function SuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loaded } = useAuth();
  const amount = Number(params.get("amount") ?? 0);
  const type = (params.get("type") ?? "deposit") as
    | "deposit"
    | "final"
    | "subscription";
  const auctionId = params.get("auction");
  const isBuyNow = params.get("buy_now") === "1";
  const ref = useRef("TX-" + Math.random().toString(36).slice(2, 10).toUpperCase());
  const fired = useRef(false);
  const [recorded, setRecorded] = useState<"pending" | "ok" | "failed">("pending");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // The auction has a "deep link" CTA when the payment is for a deposit on
  // a specific auction — that path goes straight back into the bid flow.
  const hasDeepLink = type === "deposit" && Boolean(auctionId);
  const deepLinkHref = `/auctions/${auctionId}/bid`;

  useEffect(() => {
    if (!loaded || !user || recorded !== "pending") return;
    // Guard against React strict-mode double-invoke in dev.
    if (fired.current) return;
    fired.current = true;
    fetch("/api/payment/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: ref.current,
        amount,
        type,
        auctionId,
        buyNow: isBuyNow,
      }),
    })
      .then(async (r) => {
        if (r.ok) {
          setRecorded("ok");
        } else {
          const j = await r.json().catch(() => ({}));
          setRecorded("failed");
          setErrMsg(j.error || "Échec d'enregistrement de la transaction");
        }
      })
      .catch((e) => {
        setRecorded("failed");
        setErrMsg(String(e?.message ?? e));
      });
  }, [loaded, user, recorded, type, amount, auctionId, isBuyNow]);

  // Auto deep-link back to the bid page once the deposit is recorded — saves
  // the user one tap. Only fires on the deposit-with-auction case where the
  // intent is unambiguous.
  useEffect(() => {
    if (recorded !== "ok" || !hasDeepLink) return;
    const t = setTimeout(() => router.push(deepLinkHref), AUTO_REDIRECT_MS);
    return () => clearTimeout(t);
  }, [recorded, hasDeepLink, deepLinkHref, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-[var(--max-w)] space-y-5 text-center">
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(74,222,128,0.4), transparent)",
            }}
          />
          <div className="relative h-full w-full rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(74,222,128,0.6)]">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold">
            {recorded === "failed" ? "Une erreur s'est produite" : "Paiement effectué avec succès"}
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            {recorded === "pending"
              ? "Enregistrement de la transaction..."
              : recorded === "failed"
                ? "Le montant a été débité mais la transaction n'a pas été enregistrée. Veuillez réessayer."
                : type === "deposit"
                  ? "Vous pouvez maintenant enchérir sur cette enchère"
                  : "Votre paiement a été effectué avec succès"}
          </p>
          {recorded === "failed" && errMsg && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errMsg}
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 text-right space-y-2">
          <Row label="Numéro de transaction" mono>
            {ref.current}
          </Row>
          <Row label="Montant" bold>
            <span className="tabular-nums">{formatPrice(amount)}</span>
          </Row>
          <Row label="Date">
            {new Date().toLocaleString("fr-TN")}
          </Row>
          <Row label="Statut">
            <span
              className={
                recorded === "ok"
                  ? "text-[var(--success)] font-semibold"
                  : recorded === "failed"
                    ? "text-[var(--danger)] font-semibold"
                    : "text-[var(--foreground-muted)] font-semibold inline-flex items-center gap-1.5"
              }
            >
              {recorded === "ok" ? (
                "✓ Enregistré"
              ) : recorded === "failed" ? (
                "✗ Échec"
              ) : (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Enregistrement
                </>
              )}
            </span>
          </Row>
        </div>

        {/* Stable two-button layout — same slots regardless of state.
            Slot 1: primary CTA (deep-link if available, otherwise "browse").
            Slot 2: secondary "go elsewhere" link. */}
        <div className="space-y-2 pt-1">
          <PrimaryCTA
            recorded={recorded}
            hasDeepLink={hasDeepLink}
            deepLinkHref={deepLinkHref}
          />

          <Link href={hasDeepLink ? "/auctions" : "/buyer/dashboard"}>
            <Button size="lg" variant="ghost" fullWidth>
              {hasDeepLink ? "Parcourir d'autres enchères" : "Tableau de bord"}
            </Button>
          </Link>
        </div>

        <Button variant="ghost" size="sm" fullWidth disabled>
          <Download className="h-4 w-4" />
Télécharger le reçu
        </Button>
      </div>
    </div>
  );
}

/**
 * Single primary action that adapts to state without changing slot count.
 *  - pending : shows the deep-link target, disabled with a spinner so the
 *              user knows what's coming
 *  - ok      : enabled, with an auto-redirect happening in the background
 *  - failed  : flips to "retry" pointing to the checkout origin
 *  - no deep link (final-payment / subscription) : falls back to /auctions
 */
function PrimaryCTA({
  recorded,
  hasDeepLink,
  deepLinkHref,
}: {
  recorded: "pending" | "ok" | "failed";
  hasDeepLink: boolean;
  deepLinkHref: string;
}) {
  if (!hasDeepLink) {
    return (
      <Link href="/auctions">
        <Button size="lg" fullWidth>
Continuer la navigation
          <ArrowRight className="h-5 w-5" />
        </Button>
      </Link>
    );
  }

  if (recorded === "pending") {
    return (
      <Button size="lg" fullWidth disabled>
        <Loader2 className="h-5 w-5 animate-spin" />
        Préparation...
      </Button>
    );
  }

  if (recorded === "failed") {
    return (
      <Link href="/auctions">
        <Button size="lg" fullWidth variant="secondary">
Retour aux enchères
        </Button>
      </Link>
    );
  }

  // recorded === "ok"
  return (
    <Link href={deepLinkHref}>
      <Button size="lg" fullWidth>
        <ArrowRight className="h-5 w-5" />
        Commencer l'enchère maintenant
      </Button>
    </Link>
  );
}

/** Simple key-value row used by the receipt card. */
function Row({
  label,
  children,
  mono,
  bold,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-[var(--foreground-muted)]">{label}</span>
      <span className={`${mono ? "font-mono " : ""}${bold ? "font-bold " : "font-semibold "}`}>
        {children}
      </span>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SuccessContent />
    </Suspense>
  );
}
