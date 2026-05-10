import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { UsersBrowser } from "./UsersBrowser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AdminUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  username: string | null;
  role: string;
  admin_role: string | null;
  kyc_status: string;
  trust_score: number;
  city: string | null;
  is_pro: boolean;
  is_active: boolean;
  is_banned: boolean;
  bid_count: number;
  auction_count: number;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    role?: string;
    kyc?: string;
    banned?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: sp.q?.trim() || null,
    p_role: sp.role && sp.role !== "all" ? sp.role : null,
    p_kyc_status: sp.kyc && sp.kyc !== "all" ? sp.kyc : null,
    p_only_banned: sp.banned === "1",
    p_limit: 200,
    p_offset: 0,
  });
  const users: AdminUserRow[] = error ? [] : ((data as AdminUserRow[]) ?? []);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">Utilisateurs</h1>
          <Badge variant="gold">
            {users.length} {users.length === 1 ? "utilisateur" : "utilisateurs"}
          </Badge>
        </div>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur de chargement : {error.message}
          </div>
        )}

        <UsersBrowser
          initialQuery={sp.q ?? ""}
          initialRole={sp.role ?? "all"}
          initialKyc={sp.kyc ?? "all"}
          initialBannedOnly={sp.banned === "1"}
          users={users}
        />
      </div>
    </AdminShell>
  );
}
