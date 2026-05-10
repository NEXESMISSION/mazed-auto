import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listAuctions } from "@/lib/db";
import { AuctionsQueueList } from "./AuctionsQueueList";
import { PendingDecisionList } from "./PendingDecisionList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuctionsQueuePage() {
  const supabase = await createClient();
  // Sweep first so any auctions whose end_time has passed move out of
  // active/ending and (if they have bids) land in pending_seller_decision
  // — that's the second list on this page. Without the sweep the admin
  // would briefly see a stale gap.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore
  }

  const [moderation, pendingDecision] = await Promise.all([
    listAuctions(supabase, { status: ["pending_review"] }),
    listAuctions(supabase, { status: ["pending_seller_decision"] }),
  ]);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-8 max-w-5xl">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-extrabold">
              Enchères à modérer
            </h1>
            <Badge variant="gold">{moderation.length} en attente</Badge>
          </div>

          <p className="text-sm text-[var(--foreground-muted)]">
            Vérifiez les photos, la vidéo, la carte grise et les données du véhicule avant la publication.
          </p>

          {moderation.length === 0 ? (
            <div className="text-center py-12 text-[var(--foreground-muted)] text-sm">
              ✓ Aucune enchère à modérer
            </div>
          ) : (
            <AuctionsQueueList initial={moderation} />
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-extrabold">
              En attente de décision du vendeur
            </h2>
            <Badge variant={pendingDecision.length > 0 ? "warning" : "default"}>
              {pendingDecision.length}
            </Badge>
          </div>

          <p className="text-sm text-[var(--foreground-muted)]">
            Enchères terminées dont le vendeur doit accepter ou refuser
            l&apos;offre du plus haut enchérisseur. Le sweep automatique
            résout les rangées dépassées (statut → réserve non atteinte,
            cautions remboursées).
          </p>

          {pendingDecision.length === 0 ? (
            <div className="text-center py-8 text-[var(--foreground-muted)] text-sm">
              Aucune décision en attente
            </div>
          ) : (
            <PendingDecisionList items={pendingDecision} />
          )}
        </section>
      </div>
    </AdminShell>
  );
}
