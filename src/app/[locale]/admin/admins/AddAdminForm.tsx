"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { adminSetRoleAction } from "@/app/[locale]/admin/actions";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin";

export function AddAdminForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AdminRole>("moderator");

  function submit() {
    if (!userId.trim()) {
      toast("ID utilisateur requis", "warning");
      return;
    }
    if (
      !window.confirm(
        `Promouvoir ${userId.slice(0, 8)} en "${role}" ?\nL'utilisateur recevra accès à /admin lors de sa prochaine connexion.`,
      )
    )
      return;
    start(async () => {
      const r = await adminSetRoleAction({ userId: userId.trim(), role });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("Admin ajouté", "success");
      setUserId("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <h2 className="text-sm font-bold">Promouvoir un utilisateur en admin</h2>
      <p className="text-[11px] text-[var(--foreground-muted)]">
        Trouvez l&apos;ID utilisateur depuis{" "}
        <code className="font-mono">/admin/users</code>, puis collez-le ici.
      </p>
      <div className="grid md:grid-cols-[2fr_1fr_auto] gap-2">
        <Input
          placeholder="UUID utilisateur"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
        >
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button onClick={submit} disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "..." : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}
