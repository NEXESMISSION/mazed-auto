"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline admin controls on each /admin/users row: change a user's role
 * (incl. promoting to admin) and KYC status. Each change PATCHes
 * /api/admin/users/[id] (requireAdmin-gated) and refreshes the server list.
 * The acting admin's OWN role select is disabled to prevent a self-lockout.
 */

const ROLES: { v: string; label: string }[] = [
  { v: "individual", label: "Particulier" },
  { v: "agency", label: "Agence" },
  { v: "bank", label: "Banque" },
  { v: "bailiff", label: "Huissier" },
  { v: "inspector", label: "Inspecteur" },
  { v: "admin", label: "Admin" },
];

const SELECT =
  "h-8 rounded-lg border border-border bg-surface-2 px-2 text-[11px] font-bold text-foreground outline-none transition-colors focus:border-gold-soft disabled:cursor-not-allowed disabled:opacity-50";

export function UserRowActions({
  id,
  role,
  isSelf,
}: {
  id: string;
  role: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, string>) {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
        setErr(j.detail ?? j.error ?? "Échec");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setErr("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Rôle de l'utilisateur"
          value={role}
          disabled={disabled || isSelf}
          title={isSelf ? "Vous ne pouvez pas changer votre propre rôle" : "Changer le rôle"}
          onChange={(e) => patch({ role: e.target.value })}
          className={SELECT}
        >
          {ROLES.map((r) => (
            <option key={r.v} value={r.v}>
              {r.label}
            </option>
          ))}
        </select>
        {/* The KYC dropdown is gone with the feature (0164): the endpoint it
            called, admin_set_kyc_status, no longer exists, so every use of it
            failed with "set_kyc_failed" and left the admin guessing. */}
      </div>
      {err && <span className="text-[10px] font-semibold text-red-400">{err}</span>}
    </div>
  );
}
