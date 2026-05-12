"use client";

// Seller-segment error boundary. Wizard pages and dashboards pull
// auctions / subscriptions / payouts; any of those queries failing
// shouldn't black out the whole site. Keep the recovery affordances
// scoped to "seller stuff" so a stuck user lands somewhere productive.

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function SellerError({ error, unstable_retry }: Props) {
  useEffect(() => {

    console.error("[seller-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-4">
        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          Espace vendeur
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          Cette page n&apos;a pas pu se charger
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Un problème est survenu en récupérant vos données. Réessayez, ou
          revenez à votre tableau de bord.
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-[var(--foreground-subtle)]">
            ref: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="px-4 h-10 rounded-[var(--radius)] bg-[var(--gold)] text-black font-bold text-sm hover:opacity-90"
          >
            Réessayer
          </button>
          <Link
            href="/seller/dashboard"
            className="px-4 h-10 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] font-bold text-sm hover:border-[var(--gold)]/40 flex items-center justify-center"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
