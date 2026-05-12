"use client";

// Auction-detail error boundary. This page does the heaviest lifting on
// the site — auction RPC + recent bids + seller profile + watchlist
// check + realtime subscription — and any one of them failing should
// degrade to a useful "go back to listings" UI rather than a blank page.

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function AuctionError({ error, unstable_retry }: Props) {
  useEffect(() => {

    console.error("[auction-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-4">
        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          Enchère
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          Cette enchère ne peut pas s&apos;afficher
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Elle a peut-être été retirée ou un problème temporaire
          empêche son chargement. Vous pouvez réessayer ou explorer les
          autres ventes en cours.
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
            href="/auctions"
            className="px-4 h-10 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] font-bold text-sm hover:border-[var(--gold)]/40 flex items-center justify-center"
          >
            Toutes les enchères
          </Link>
        </div>
      </div>
    </div>
  );
}
