"use client";

// Root-segment error boundary. Wraps every page under [locale] that
// doesn't have a more specific `error.tsx`. Without this, an unhandled
// throw during render or data-fetching propagates to the framework's
// generic "An error occurred in the Server Components render" screen —
// which leaks nothing useful AND offers no recovery affordance.
//
// In Next.js 16 the boundary signature changed: the second prop is
// `unstable_retry`, not the historical `reset`. Don't use `reset` here
// or the button will silently no-op.
//
// Error boundaries MUST be client components — the React Error Boundary
// machinery is a class component with state, which can't run on the
// server.

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function LocaleError({ error, unstable_retry }: Props) {
  useEffect(() => {
    // Surface to whatever telemetry sink is wired (Sentry is in deps but
    // the integration may not always be initialized in dev). console.error
    // is the fallback that always works for users-as-debuggers.

    console.error("[locale-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-4">
        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          Erreur
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          Une erreur s&apos;est produite
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Quelque chose s&apos;est mal passé pendant le chargement de cette
          page. Essayez à nouveau ou revenez à l&apos;accueil.
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-[var(--foreground-subtle)] break-all">
            Code de référence&nbsp;: {error.digest}
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
            href="/"
            className="px-4 h-10 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] font-bold text-sm hover:border-[var(--gold)]/40 flex items-center justify-center"
          >
            Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
