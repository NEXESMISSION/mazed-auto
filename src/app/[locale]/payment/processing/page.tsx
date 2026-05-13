"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { LifeBuoy } from "lucide-react";

/**
 * Stand-in "Traitement en cours" screen while the payment gateway
 * settles. We auto-redirect to success/failure after a short delay,
 * but if the redirect hangs (slow network, paused tab, etc.) we
 * surface a manual escape after 8s so the user is never trapped on
 * a spinner without options.
 */
function ProcessingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const failureRate = 0;
    const t = setTimeout(() => {
      const failed = Math.random() < failureRate;
      const url = new URL(
        window.location.origin + (failed ? "/payment/failed" : "/payment/success"),
      );
      params.forEach((v, k) => url.searchParams.set(k, v));
      router.replace(url.pathname + url.search);
    }, 2200);

    // If for any reason the navigation hasn't happened after 8s, give
    // the user a way out. Mostly a guard for very slow connections.
    const stallT = setTimeout(() => setStalled(true), 8000);

    return () => {
      clearTimeout(t);
      clearTimeout(stallT);
    };
  }, [router, params]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-sm">
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,55,0.3), transparent)",
            }}
          />
          <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)] border-t-transparent animate-spin" />
          <div className="absolute inset-3 rounded-full bg-[var(--gold-faint)]" />
        </div>
        <div>
          <div className="text-xl font-bold">Traitement du paiement</div>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            Ne fermez pas cette page — la transaction se finalise en quelques secondes.
          </p>
        </div>

        {stalled && (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-start space-y-3">
            <div className="text-sm font-bold">
              Le traitement prend plus de temps que prévu
            </div>
            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              Aucun débit n&apos;a été confirmé. Vous pouvez vérifier l&apos;état
              de votre transaction ou contacter le support si vous voyez un
              prélèvement sans confirmation.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/transactions"
                className="inline-flex items-center justify-center h-10 rounded-[var(--radius)] bg-[var(--surface-2)] ring-1 ring-[var(--border)] text-sm font-bold hover:ring-[var(--gold-soft)] transition-colors"
              >
                Voir mes transactions
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-1.5 h-10 rounded-[var(--radius)] text-sm font-bold text-[var(--gold)] hover:underline"
              >
                <LifeBuoy className="h-4 w-4" />
                Contacter le support
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProcessingContent />
    </Suspense>
  );
}
