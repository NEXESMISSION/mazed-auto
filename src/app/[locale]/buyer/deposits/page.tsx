import { Link } from "@/i18n/navigation";
import { Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const statusVariant: Record<
  string,
  "warning" | "success" | "danger" | "gold" | "default"
> = {
  pending: "warning",
  processing: "gold",
  completed: "success",
  failed: "danger",
};

const statusLabels: Record<string, string> = {
  pending: "Bloquée",
  processing: "En cours",
  completed: "Terminé",
  failed: "Échec",
};

export default async function DepositsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
          <Header />
          <div className="text-center py-16 space-y-3">
            <div className="font-bold">Connectez-vous pour voir vos cautions</div>
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const allTx = await listTransactions(supabase, {
    userId: user.id,
    limit: 100,
  });
  const deposits = allTx.filter((r) => r.type === "deposit");
  const totalHeld = deposits
    .filter((d) => d.status === "pending" || d.status === "processing")
    .reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <Header />

        <div className="rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--foreground-muted)] mb-1">
            Total des cautions actuellement bloquées
          </div>
          <div className="text-3xl font-extrabold gradient-gold-text tabular-nums">
            {formatPrice(totalHeld)}
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mt-2 leading-relaxed">
            Ces montants sont bloqués sur un compte séquestre dédié, et remboursés automatiquement si vous
            ne gagnez pas l'enchère.
          </p>
        </div>

        {deposits.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
Aucune caution pour le moment
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {deposits.map((d) => (
              <div
                key={d.id}
                className="p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm line-clamp-1">
                    {d.label || d.ref}
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {d.created_at.slice(0, 10)}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-bold tabular-nums">
                    {formatPrice(Number(d.amount))}
                  </div>
                  <Badge variant={statusVariant[d.status]} size="sm">
                    {statusLabels[d.status]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold flex items-center gap-2">
        <Wallet className="h-6 w-6 text-blue-400" />
        Mes cautions
      </h1>
      <p className="text-sm text-[var(--foreground-muted)] mt-1">
        Cautions de participation aux enchères (5%)
      </p>
    </div>
  );
}
