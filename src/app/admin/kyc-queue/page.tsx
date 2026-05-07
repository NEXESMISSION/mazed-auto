import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listSellers } from "@/lib/db";
import {
  getKycFaceMatchThreshold,
  getKycOcrConfidenceThreshold,
} from "@/lib/config";
import { KycQueueList } from "./KycQueueList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KYCQueuePage() {
  const supabase = await createClient();
  const [all, faceThreshold, ocrThreshold] = await Promise.all([
    listSellers(supabase),
    getKycFaceMatchThreshold(),
    getKycOcrConfidenceThreshold(),
  ]);
  const items = all.filter((s) => !s.verifiedKyc);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">File KYC</h1>
          <Badge variant="warning">{items.length} en attente</Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">
          Vendeurs dont la vérification n'est pas encore terminée. L'acceptation ici active leur droit de
          publier.
        </p>

        {items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            ✓ Aucune demande à examiner
          </div>
        ) : (
          <KycQueueList
            items={items}
            faceThreshold={faceThreshold}
            ocrThreshold={ocrThreshold}
          />
        )}
      </div>
    </AdminShell>
  );
}
