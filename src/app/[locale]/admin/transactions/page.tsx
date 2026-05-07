import { AdminShell } from "@/components/layout/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/db";
import { AdminTxList } from "./AdminTxList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTransactionsPage() {
  const supabase = await createClient();
  const txs = await listTransactions(supabase, { limit: 100 });

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl">
        <AdminTxList initial={txs} />
      </div>
    </AdminShell>
  );
}
