"use client";

// Admin-segment error boundary. Failure modes here are typically (a) an
// RPC call returning a Postgres error string (e.g. RLS denied, function
// not found after a migration drift), or (b) data missing because the
// caller hit a route they don't have the capability for. Both surface
// far more usefully here than as a 500.

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function AdminError({ error, unstable_retry }: Props) {
  useEffect(() => {

    console.error("[admin-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-4">
        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-red-400">
          Erreur admin
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          Cette section ne peut pas se charger
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Une erreur est survenue côté serveur. Si elle persiste, vérifiez le
          journal d&apos;audit ou contactez l&apos;équipe technique.
        </p>
        {error.message && (
          <pre className="text-[11px] text-start font-mono text-[var(--foreground-subtle)] bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {error.message}
            {error.digest ? `\n\nref: ${error.digest}` : ""}
          </pre>
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
            href="/admin"
            className="px-4 h-10 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] font-bold text-sm hover:border-[var(--gold)]/40 flex items-center justify-center"
          >
            Retour à l&apos;admin
          </Link>
        </div>
      </div>
    </div>
  );
}
