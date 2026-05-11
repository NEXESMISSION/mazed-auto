import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ action?: string; user?: string; q?: string }>;
  params: Promise<{ locale: string }>;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_user_id: string | null;
  target_auction_id: string | null;
  target_id: string | null;
  target_type: string | null;
  detail: string | null;
  metadata: unknown;
  created_at: string;
}

export default async function AdminActivityPage({ searchParams, params }: Props) {
  const sp = await searchParams;
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.activity" });
  const supabase = await createClient();
  let q = supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.action) q = q.ilike("action", `${sp.action}%`);
  if (sp.user) q = q.eq("target_user_id", sp.user);
  if (sp.q) q = q.ilike("detail", `%${sp.q}%`);

  const { data, error } = await q;
  const rows = (data ?? []) as AuditRow[];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">{t("title")}</h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">{t("intro")}</p>

        <form className="flex gap-2 flex-wrap">
          <input
            name="action"
            defaultValue={sp.action ?? ""}
            placeholder={t("filterActionPlaceholder")}
            aria-label={t("filterActionPlaceholder")}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm flex-1 min-w-[200px]"
          />
          <input
            name="user"
            defaultValue={sp.user ?? ""}
            placeholder={t("filterUserPlaceholder")}
            aria-label={t("filterUserPlaceholder")}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm flex-1 min-w-[200px]"
          />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("filterDetailPlaceholder")}
            aria-label={t("filterDetailPlaceholder")}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm flex-1 min-w-[200px]"
          />
          <button
            type="submit"
            className="bg-[var(--gold)] text-black font-bold h-11 px-4 rounded-[var(--radius)] text-sm"
          >
            {t("filterCta")}
          </button>
        </form>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            {t("error", { error: error.message })}
          </div>
        )}

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {rows.length === 0 && (
            <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
              {t("empty")}
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 grid md:grid-cols-[200px_1fr_auto] gap-3 items-start">
              <div>
                <code className="font-mono text-xs font-bold">{r.action}</code>
                <div className="text-[10px] text-[var(--foreground-muted)] tabular-nums mt-0.5">
                  {new Date(r.created_at).toLocaleString("fr-FR")}
                </div>
                {r.actor_role && (
                  <Badge size="sm" variant="default" className="mt-1">
                    {r.actor_role}
                  </Badge>
                )}
              </div>
              <div className="text-sm">
                {r.detail && <div>{r.detail}</div>}
                {r.target_user_id && (
                  <Link
                    href={`/admin/users/${r.target_user_id}`}
                    className="text-[11px] text-[var(--gold)] hover:underline"
                  >
                    User → {r.target_user_id.slice(0, 8)}
                  </Link>
                )}
                {r.target_auction_id && (
                  <Link
                    href={`/admin/auctions/${r.target_auction_id}`}
                    className="text-[11px] text-[var(--gold)] hover:underline ms-3"
                  >
                    Auction → {r.target_auction_id.slice(0, 8)}
                  </Link>
                )}
                {r.metadata != null && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-[var(--foreground-muted)] cursor-pointer">
                      {t("metadataLabel")}
                    </summary>
                    <pre className="text-[10px] font-mono bg-[var(--surface-2)] p-2 rounded mt-1 overflow-auto max-h-40">
                      {JSON.stringify(r.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums">
                {r.actor_id?.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
