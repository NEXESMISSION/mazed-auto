import Link from "next/link";
import { Search, ChevronLeft, Filter } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listSellers } from "@/lib/db";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const sellers = await listSellers(supabase);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">Utilisateurs</h1>
          <Badge variant="gold">{sellers.length} {sellers.length === 1 ? "utilisateur" : "utilisateurs"}</Badge>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Rechercher par nom ou @username..."
            iconLeft={<Search className="h-4 w-4" />}
            disabled
          />
          <Button variant="secondary" size="md" disabled>
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_60px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
            <div>L'utilisateur</div>
            <div>Niveau</div>
            <div>Trust</div>
            <div>Ventes</div>
            <div>Ville</div>
            <div></div>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {sellers.length === 0 && (
              <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
                Aucun utilisateur. Exécutez seed.sql dans Supabase.
              </div>
            )}
            {sellers.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_60px] gap-3 p-4 items-center hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar size="md" alt={u.displayName} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm line-clamp-1">
                      {u.displayName}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)]">
                      @{u.username}
                    </div>
                  </div>
                </div>
                <div className="hidden md:block">
                  <Badge
                    variant={
                      u.trustLevel === "verified_pro"
                        ? "goldFilled"
                        : u.trustLevel === "very_trusted"
                          ? "gold"
                          : u.trustLevel === "trusted"
                            ? "success"
                            : "default"
                    }
                    size="sm"
                  >
                    {u.trustLevel === "verified_pro"
                      ? "Pro"
                      : u.trustLevel === "very_trusted"
                        ? "Très fiable"
                        : u.trustLevel === "trusted"
                          ? "Fiable"
                          : "Nouveau"}
                  </Badge>
                </div>
                <div className="hidden md:block font-bold text-[var(--gold)] tabular-nums">
                  {u.trustScore}
                </div>
                <div className="hidden md:block text-sm tabular-nums">
                  {u.successfulDeals}
                </div>
                <div className="hidden md:block text-sm text-[var(--foreground-muted)]">
                  {u.city}
                </div>
                <span className="h-8 w-8 rounded-full hover:bg-[var(--surface-3)] flex items-center justify-center justify-self-end text-[var(--foreground-muted)]">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
