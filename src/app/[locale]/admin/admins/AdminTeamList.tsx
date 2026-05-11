"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Shield, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { adminSetRoleAction } from "@/app/[locale]/admin/actions";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin";

interface Row {
  id: string;
  email: string | null;
  display_name: string | null;
  admin_role: string | null;
  created_at: string;
  last_seen: string | null;
}

export function AdminTeamList({
  rows,
  canAssign,
}: {
  rows: Row[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function setRole(id: string, role: AdminRole | null) {
    if (
      !window.confirm(
        role
          ? `Changer le rôle de cet admin en "${role}" ?`
          : "Révoquer entièrement les privilèges admin ?",
      )
    )
      return;
    setBusy(id);
    const r = await adminSetRoleAction({ userId: id, role });
    setBusy(null);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    toast(role ? `Rôle changé en ${role}` : "Privilèges révoqués", "success");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <div className="hidden md:grid grid-cols-[2fr_1fr_120px_140px_auto] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
        <div>Admin</div>
        <div>Rôle</div>
        <div>Membre depuis</div>
        <div>Dernière activité</div>
        <div></div>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
            Aucun admin enregistré.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid md:grid-cols-[2fr_1fr_120px_140px_auto] gap-2 p-4 items-center"
          >
            <div>
              <div className="font-bold text-sm">
                {r.display_name ?? "(sans nom)"}
              </div>
              <div className="text-xs text-[var(--foreground-muted)] truncate">
                {r.email ?? r.id.slice(0, 8)}
              </div>
            </div>
            <div>
              <Badge
                size="sm"
                variant={
                  r.admin_role === "super_admin"
                    ? "gold"
                    : r.admin_role === "finance"
                      ? "info"
                      : "default"
                }
              >
                {r.admin_role ?? "—"}
              </Badge>
            </div>
            <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
              <span className="md:hidden font-semibold text-[var(--foreground-subtle)]">
                Membre depuis :{" "}
              </span>
              {new Date(r.created_at).toLocaleDateString("fr-TN")}
            </div>
            <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
              <span className="md:hidden font-semibold text-[var(--foreground-subtle)]">
                Dernière activité :{" "}
              </span>
              {r.last_seen
                ? new Date(r.last_seen).toLocaleString("fr-TN")
                : "—"}
            </div>
            {canAssign && (
              <div className="flex flex-wrap gap-1 justify-end">
                <select
                  value={r.admin_role ?? ""}
                  disabled={busy === r.id}
                  onChange={(e) =>
                    setRole(r.id, (e.target.value || null) as AdminRole | null)
                  }
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 h-8 text-xs"
                >
                  <option value="">— aucun —</option>
                  {ADMIN_ROLES.map((ar) => (
                    <option key={ar} value={ar}>
                      {ar}
                    </option>
                  ))}
                </select>
                {r.admin_role && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRole(r.id, null)}
                    disabled={busy === r.id}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
            {!canAssign && r.admin_role && (
              <div className="text-xs text-[var(--foreground-muted)] flex items-center gap-1 justify-end">
                <Shield className="h-3.5 w-3.5" />
                lecture seule
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
