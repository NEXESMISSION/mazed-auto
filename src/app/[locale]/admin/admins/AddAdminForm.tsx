"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.addAdminForm");
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AdminRole>("moderator");

  function submit() {
    if (!userId.trim()) {
      toast(t("toastIdRequired"), "warning");
      return;
    }
    if (
      !window.confirm(
        t("confirmPromote", { userId: userId.slice(0, 8), role }),
      )
    )
      return;
    start(async () => {
      const r = await adminSetRoleAction({ userId: userId.trim(), role });
      if (!r.ok) {
        toast(t("toastFailed", { error: r.error }), "error");
        return;
      }
      toast(t("toastAdded"), "success");
      setUserId("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <h2 className="text-sm font-bold">{t("heading")}</h2>
      <p className="text-[11px] text-[var(--foreground-muted)]">
        {t("hintBefore")}
        <code className="font-mono">/admin/users</code>
        {t("hintAfter")}
      </p>
      <div className="grid md:grid-cols-[2fr_1fr_auto] gap-2">
        <Input
          placeholder={t("userIdPlaceholder")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          aria-label={t("userIdPlaceholder")}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          aria-label={t("rolePickerLabel")}
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
          {pending ? "..." : t("add")}
        </Button>
      </div>
    </div>
  );
}
