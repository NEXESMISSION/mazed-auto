import { Link } from "@/i18n/navigation";
import { Receipt } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/db";
import { TransactionsList } from "./TransactionsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-4">
          <h1 className="text-2xl font-extrabold">Transactions</h1>
          <div className="text-center py-16 space-y-3">
            <Receipt className="h-12 w-12 text-[var(--gold)] mx-auto" />
            <div className="font-bold">Connectez-vous pour voir vos transactions</div>
            <Link href="/login">
              <Button size="md">Connexion</Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const txs = await listTransactions(supabase, {
    userId: user.id,
    limit: 200,
  });

  return (
    <AppShell>
      {/* Desktop magazine header */}
      <div className="hidden lg:block max-w-[var(--max-w-app)] mx-auto px-8 pt-10 pb-6">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          <Receipt className="h-3.5 w-3.5" />
          Historique
        </div>
        <h1 className="mt-2 text-4xl xl:text-5xl font-black tracking-tight leading-[1.05]">
          Mes <span className="gradient-gold-text">transactions</span>
        </h1>
        <p className="mt-3 text-base text-[var(--foreground-muted)] max-w-2xl">
          Toutes vos cautions, paiements finaux et remboursements en un seul
          relevé. Filtrez par type pour suivre ce qui compte.
        </p>
        <div className="mt-6 h-px w-full bg-gradient-to-r from-[var(--border)] via-[var(--border)] to-transparent" />
      </div>

      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 lg:px-8 lg:py-0 lg:pb-16 space-y-4">
        <TransactionsList txs={txs} />
      </div>
    </AppShell>
  );
}
