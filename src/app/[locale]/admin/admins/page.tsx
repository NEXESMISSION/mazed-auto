import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin";
import { AdminTeamList } from "./AdminTeamList";
import { AddAdminForm } from "./AddAdminForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myRole = getAdminRole(user);
  const canAssign = myRole === "super_admin";

  const { data, error } = await supabase.rpc("admin_list_admins");
  const rows = ((data ?? []) as never[]) as Array<{
    id: string;
    email: string | null;
    display_name: string | null;
    admin_role: string | null;
    created_at: string;
    last_seen: string | null;
  }>;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">Équipe admin</h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">
          Gestion des rôles administrateur. Seul un{" "}
          <strong>super_admin</strong> peut promouvoir, rétrograder ou révoquer
          un admin (PLAN §22.2).
        </p>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}

        {canAssign && <AddAdminForm />}

        <AdminTeamList rows={rows} canAssign={canAssign} />
      </div>
    </AdminShell>
  );
}
