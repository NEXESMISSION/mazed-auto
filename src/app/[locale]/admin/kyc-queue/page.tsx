import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { KycQueueList, type KycSubmission } from "./KycQueueList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KYCQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.kycQueue" });
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
          <h1 className="text-2xl md:text-3xl font-extrabold">
            {t("pageTitle")}
          </h1>
          <Badge variant="warning">
            {t("pendingBadge", { count: items.length })}
          </Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">{t("intro")}</p>

        {error && (
          <div className="rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
            {error.message}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            {t("empty")}
          </div>
        ) : (
          <KycQueueList items={items} />
        )}
      </div>
    </AdminShell>
  );
}
