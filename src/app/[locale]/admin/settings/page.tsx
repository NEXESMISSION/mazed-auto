import { AdminShell } from "@/components/layout/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { SettingsList, type SettingRow } from "./SettingsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AuditRow {
  id: string;
  setting_key: string;
  old_value: unknown;
  new_value: unknown;
  action: "create" | "update" | "approve" | "reject";
  changed_by: string | null;
  changed_at: string;
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [settingsRes, auditRes] = await Promise.all([
    supabase
      .from("platform_settings")
      .select(
        "key, value, type, category, description, sensitive, requires_approval, pending_value, pending_proposed_at, updated_at",
      )
      .order("category", { ascending: true })
      .order("key", { ascending: true }),
    supabase
      .from("settings_audit_log")
      .select("id, setting_key, old_value, new_value, action, changed_by, changed_at")
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  const rows: SettingRow[] = (settingsRes.data ?? []) as SettingRow[];
  const audits: AuditRow[] = (auditRes.data ?? []) as AuditRow[];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Paramètres de la plateforme
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1 leading-relaxed">
            Toutes les valeurs métier — commissions, caution, anti-sniping,
            seuils KYC, score de confiance — sont stockées dans{" "}
            <code className="text-[11px] font-mono text-[var(--gold)]">
              platform_settings
            </code>{" "}
            et modifiables ici. Chaque modification est journalisée.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center text-sm text-[var(--foreground-muted)]">
            Aucun paramètre n&apos;a encore été semé. Exécutez{" "}
            <code className="font-mono">migrate-platform-settings.sql</code>{" "}
            sur votre projet Supabase.
          </div>
        ) : (
          <SettingsList rows={rows} />
        )}

        {audits.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] px-1">
              Journal des modifications
            </h2>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
              {audits.map((a) => (
                <div
                  key={a.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <code className="font-mono font-bold text-foreground">
                      {a.setting_key}
                    </code>
                    <span className="text-[var(--foreground-muted)] mx-1.5">·</span>
                    <span className="text-[var(--foreground-muted)]">
                      {a.action}
                    </span>
                    <div className="text-[11px] mt-0.5 truncate">
                      <span className="text-[var(--foreground-subtle)] line-through">
                        {a.old_value === null ? "—" : JSON.stringify(a.old_value)}
                      </span>
                      <span className="text-[var(--foreground-muted)] mx-1.5">→</span>
                      <span className="text-[var(--gold)] font-mono">
                        {JSON.stringify(a.new_value)}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums shrink-0">
                    {new Date(a.changed_at).toLocaleString("fr-FR")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
