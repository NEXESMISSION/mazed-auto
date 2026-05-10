import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { BroadcastForm } from "./BroadcastForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BroadcastsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    body: string;
    audience: string;
    audience_filter: unknown;
    recipient_count: number;
    sent_at: string | null;
    created_at: string;
  }>;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Annonces et notifications de masse
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Envoyer une notification à tous les utilisateurs, à un rôle, ou aux
          enchérisseurs d&apos;une enchère donnée.
        </p>

        <BroadcastForm />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Historique</h2>
            <Badge variant="default">{rows.length}</Badge>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {rows.length === 0 && (
              <div className="p-6 text-center text-sm text-[var(--foreground-muted)]">
                Aucune annonce envoyée.
              </div>
            )}
            {rows.map((b) => (
              <div key={b.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-sm">{b.title}</div>
                  <Badge size="sm">
                    {b.audience} · {b.recipient_count}
                  </Badge>
                </div>
                <div className="text-xs text-[var(--foreground-muted)] mt-1 line-clamp-2">
                  {b.body}
                </div>
                <div className="text-[10px] text-[var(--foreground-subtle)] mt-1 tabular-nums">
                  {b.sent_at
                    ? new Date(b.sent_at).toLocaleString("fr-FR")
                    : "non envoyé"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
