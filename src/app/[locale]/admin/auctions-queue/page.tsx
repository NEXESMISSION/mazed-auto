import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { AuctionsQueueList } from "./AuctionsQueueList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuctionsQueuePage() {
  const supabase = await createClient();
  const items = await listAuctions(supabase, { status: ["pending_review"] });

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Enchères à modérer
          </h1>
          <Badge variant="gold">{items.length} en attente</Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">
          Vérifiez les photos, la vidéo, la carte grise et les données du véhicule avant la publication.
        </p>

        {items.length === 0 ? (
          <div className="text-center py-16 text-[var(--foreground-muted)]">
            ✓ Aucune enchère à modérer
          </div>
        ) : (
          <AuctionsQueueList initial={items} />
        )}
      </div>
    </AdminShell>
  );
}
