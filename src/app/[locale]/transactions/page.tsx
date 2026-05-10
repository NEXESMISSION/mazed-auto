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
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 space-y-4">
        <TransactionsList txs={txs} />
      </div>
    </AppShell>
  );
}
