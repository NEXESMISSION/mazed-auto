import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { KycQueueList, type KycSubmission } from "./KycQueueList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KYCQueuePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("kyc_submissions")
    .select(
      "id,user_id,full_name,id_front_url,id_back_url,selfie_video_url,selfie_image_url,status,rejection_reason,submitted_at",
    )
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  const items = (data ?? []) as KycSubmission[];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">File KYC</h1>
          <Badge variant="warning">{items.length} en attente</Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">
          Chaque dossier contient le recto/verso de la carte d&apos;identité et
          un selfie en direct. Vérifiez que le visage du selfie correspond à
          celui de la carte, que les textes sont nets, et que rien n&apos;a
          l&apos;air falsifié avant d&apos;accepter.
        </p>

        {error && (
          <div className="rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
            {error.message}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            ✓ Aucun dossier à examiner
          </div>
        ) : (
          <KycQueueList items={items} />
        )}
      </div>
    </AdminShell>
  );
}
