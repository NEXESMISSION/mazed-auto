"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";

function ProcessingContent() {
  const router = useRouter();
  const params = useSearchParams();

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
    return () => clearTimeout(t);
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
            Ne fermez pas cette page, la finalisation de la transaction ne prend que quelques secondes...
          </p>
        </div>
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
