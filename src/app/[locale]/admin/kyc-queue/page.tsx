import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { KycQueueList, type KycSubmission } from "./KycQueueList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The four views the admin can flip between. "pending" is the work
// queue; the rest are the archive so admins can audit a decision
// after the fact (the user explicitly asked to see every KYC
// submission, accepted or refused, not just the live queue).
const STATUS_TABS = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Approuvés" },
  { value: "rejected", label: "Rejetés" },
  { value: "all", label: "Tous" },
] as const;
type StatusTab = (typeof STATUS_TABS)[number]["value"];

export default async function KYCQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: statusParam } = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.kycQueue" });
  const supabase = await createClient();

  const status: StatusTab = STATUS_TABS.some((s) => s.value === statusParam)
    ? (statusParam as StatusTab)
    : "pending";

  let query = supabase
    .from("kyc_submissions")
    .select(
      "id,user_id,full_name,id_front_url,id_back_url,selfie_video_url,selfie_image_url,status,rejection_reason,submitted_at,reviewed_at",
    );
  // "all" skips the filter; every other tab pins one status.
  if (status !== "all") {
    query = query.eq("status", status);
  }
  // Pending sorts oldest-first (FIFO work queue); the archive views
  // sort newest-first (most recent decisions on top).
  query = query.order("submitted_at", { ascending: status === "pending" });

  const { data, error } = await query;
  const items = (data ?? []) as KycSubmission[];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            {t("pageTitle")}
          </h1>
          <Badge variant={status === "pending" ? "warning" : "default"}>
            {items.length}
          </Badge>
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">{t("intro")}</p>

        {/* Status tabs — the archive. Server-rendered links so the
            filter is shareable + survives a refresh. */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <Link
                key={tab.value}
                href={
                  tab.value === "pending"
                    ? "/admin/kyc-queue"
                    : `/admin/kyc-queue?status=${tab.value}`
                }
                className={`px-3 h-8 inline-flex items-center rounded-full text-xs font-bold border transition-colors ${
                  active
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "bg-[var(--surface)] text-[var(--foreground-muted)] border-[var(--border)] hover:border-[var(--gold-soft)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {error && (
          <div className="rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
            {error.message}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            {status === "pending"
              ? t("empty")
              : "Aucune soumission dans cette vue."}
          </div>
        ) : (
          <KycQueueList items={items} view={status} />
        )}
      </div>
    </AdminShell>
  );
}
