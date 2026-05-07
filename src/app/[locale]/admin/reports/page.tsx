import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listReports } from "@/lib/db";
import { ReportsList } from "./ReportsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportsPage() {
  const supabase = await createClient();
  const reports = await listReports(supabase, ["open", "reviewing"]);
  const open = reports.filter((r) => r.status === "open");
  const reviewing = reports.filter((r) => r.status === "reviewing");

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Plaintes et signalements
          </h1>
          <div className="flex gap-2">
            <Badge variant="danger">{open.length} ouverts</Badge>
            <Badge variant="warning">{reviewing.length} en revue</Badge>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-[var(--foreground-muted)]">
            ✓ Aucun signalement ouvert
          </div>
        ) : (
          <ReportsList initial={reports} />
        )}
      </div>
    </AdminShell>
  );
}
