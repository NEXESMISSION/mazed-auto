import { AdminShell } from "@/components/layout/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { SystemTools } from "./SystemTools";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SystemPage() {
  const supabase = await createClient();
  // Snapshot of useful counts so the admin sees immediate health metrics.
  const [activeAuctions, pendingReview, pendingDecision, openReports, pendingKyc, openContact] =
    await Promise.all([
      supabase
        .from("auctions")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "ending"]),
      supabase
        .from("auctions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase
        .from("auctions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_seller_decision"),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "reviewing"]),
      supabase
        .from("kyc_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "reading"]),
    ]);

  const counts = {
    activeAuctions: activeAuctions.count ?? 0,
    pendingReview: pendingReview.count ?? 0,
    pendingDecision: pendingDecision.count ?? 0,
    openReports: openReports.count ?? 0,
    pendingKyc: pendingKyc.count ?? 0,
    openContact: openContact.count ?? 0,
  };

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Système &amp; outils
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Enchères actives" value={counts.activeAuctions} />
          <Stat label="En attente de modération" value={counts.pendingReview} />
          <Stat label="Décisions vendeur" value={counts.pendingDecision} />
          <Stat label="Signalements ouverts" value={counts.openReports} />
          <Stat label="KYC en attente" value={counts.pendingKyc} />
          <Stat label="Contacts ouverts" value={counts.openContact} />
        </div>

        <SystemTools />
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--foreground-muted)] mb-1">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums text-[var(--gold)]">
        {value}
      </div>
    </div>
  );
}
