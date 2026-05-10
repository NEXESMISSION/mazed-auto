import { Link } from "@/i18n/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DupRow {
  phone: string;
  user_count: number;
  user_ids: string[];
}
interface RapidRow {
  user_id: string;
  bid_count: number;
  auctions: number;
  last_bid: string;
}
interface ReportRow {
  auction_id: string;
  reports: number;
  reasons: string[];
  worst: string;
}
interface OffenderRow {
  user_id: string;
  active_bans: number;
  total_warnings: number;
  trust_score: number;
}

export default async function FraudPage() {
  const supabase = await createClient();
  const [dups, rapid, reports, offenders] = await Promise.all([
    supabase.rpc("fraud_duplicate_phones", { p_limit: 30 }),
    supabase.rpc("fraud_rapid_bidders", { p_threshold: 20, p_limit: 30 }),
    supabase.rpc("fraud_reported_auctions", { p_min_reports: 3, p_limit: 30 }),
    supabase.rpc("fraud_chronic_offenders", { p_limit: 30 }),
  ]);

  const dupRows = (dups.data ?? []) as DupRow[];
  const rapidRows = (rapid.data ?? []) as RapidRow[];
  const reportRows = (reports.data ?? []) as ReportRow[];
  const offenderRows = (offenders.data ?? []) as OffenderRow[];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Signaux de fraude
          </h1>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">
          Indicateurs lus en direct depuis la base. Pas un système anti-fraude
          complet — un point de départ pour repérer ce qui sort de l&apos;ordinaire.
        </p>

        <Section
          title={`Téléphones partagés par plusieurs comptes (${dupRows.length})`}
          tone="amber"
        >
          {dupRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {dupRows.map((d) => (
                <div
                  key={d.phone}
                  className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3"
                >
                  <div>
                    <div className="font-mono text-sm">{d.phone}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.user_ids.map((id) => (
                        <Link
                          key={id}
                          href={`/admin/users/${id}`}
                          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 h-5 rounded bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--gold)]"
                        >
                          {id.slice(0, 8)}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      ))}
                    </div>
                  </div>
                  <Badge size="sm" variant="warning">
                    {d.user_count}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Enchérisseurs rapides — > 20 offres / 24h (${rapidRows.length})`}
          tone="amber"
        >
          {rapidRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {rapidRows.map((r) => (
                <Link
                  key={r.user_id}
                  href={`/admin/users/${r.user_id}`}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <div className="font-mono text-xs">
                    {r.user_id.slice(0, 8)}
                  </div>
                  <Badge size="sm">{r.bid_count} offres</Badge>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    sur {r.auctions} enchères
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Annonces très signalées — ≥3 ouverts (${reportRows.length})`}
          tone="red"
        >
          {reportRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {reportRows.map((a) => (
                <Link
                  key={a.auction_id}
                  href={`/admin/auctions/${a.auction_id}`}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <div>
                    <div className="font-mono text-xs">
                      {a.auction_id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                      {a.reasons.join(", ")}
                    </div>
                  </div>
                  <Badge size="sm" variant="danger">
                    {a.reports} reports
                  </Badge>
                  <Badge
                    size="sm"
                    variant={a.worst === "high" ? "danger" : "warning"}
                  >
                    {a.worst}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Récidivistes — banni actif ou ≥2 avertissements (${offenderRows.length})`}
          tone="red"
        >
          {offenderRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {offenderRows.map((o) => (
                <Link
                  key={o.user_id}
                  href={`/admin/users/${o.user_id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <div className="font-mono text-xs">
                    {o.user_id.slice(0, 8)}
                  </div>
                  <Badge size="sm" variant="danger">
                    {o.active_bans} ban{o.active_bans > 1 ? "s" : ""}
                  </Badge>
                  <Badge size="sm" variant="warning">
                    {o.total_warnings} avert.
                  </Badge>
                  <span className="text-xs tabular-nums text-[var(--gold)] font-bold">
                    Trust {o.trust_score}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "amber" | "red";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <h2
        className={`px-4 py-2.5 text-sm font-bold border-b border-[var(--border)] ${
          tone === "red"
            ? "bg-red-500/10 text-red-300"
            : "bg-amber-500/10 text-amber-300"
        }`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div className="p-6 text-center text-sm text-[var(--foreground-muted)]">
      Rien à signaler.
    </div>
  );
}
