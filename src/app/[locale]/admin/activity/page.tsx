import { getServerSupabase } from "@/lib/supabase/server";
import { AdminPage, Toolbar, EmptyState, EYEBROW, type Tab } from "@/components/admin/kit";
import { SiteTabs } from "@/components/admin/kit/SiteTabs";
import { AdminPager } from "@/components/admin/AdminPager";
import { ACTION_LABEL } from "@/lib/admin/actions";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Journal — who did what, and when.
 *
 * The table it reads holds 17 034 rows, and **16 836 of them are page views**
 * with a null action. The 198 rows that record an actual decision were buried
 * under them, which made the one screen whose entire purpose is accountability
 * useless. Two changes fix it: the middleware no longer writes a page_view for
 * admin navigation at all, and "Décisions" — `action is not null` — is the
 * default tab here rather than an option you have to find.
 *
 * Page views are still reachable, because "who was on the site at 3am" is a
 * real question. They are just no longer the first thing you see.
 */

const PAGE_SIZE = 50;

type TabKey = "actions" | "errors" | "views";
const TAB_LABEL: Record<TabKey, string> = {
  actions: "Décisions",
  errors: "Erreurs",
  views: "Pages visitées",
};
const TAB_ORDER: TabKey[] = ["actions", "errors", "views"];

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const sb = await getServerSupabase();

  const tab: TabKey = TAB_ORDER.includes(sp.status as TabKey) ? (sp.status as TabKey) : "actions";
  const q = (sp.q ?? "").trim().slice(0, 60).replace(/[,()*%]/g, " ").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = sb
    .from("activity_log")
    .select("id, created_at, action, type, user_email, path, status", { count: "exact" });

  if (tab === "actions") query = query.not("action", "is", null);
  if (tab === "views") query = query.eq("type", "page_view");
  if (tab === "errors") query = query.or("type.eq.error,status.gte.400");
  if (q) query = query.or(`user_email.ilike.%${q}%,action.ilike.%${q}%,path.ilike.%${q}%`);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs: Tab[] = TAB_ORDER.map((t) => ({ value: t, label: TAB_LABEL[t] }));

  type LogRow = {
    id: string; created_at: string; action: string | null; type: string | null;
    user_email: string | null; path: string | null; status: number | null;
  };
  const rows = (data ?? []) as LogRow[];

  return (
    <AdminPage wide>
      <SiteTabs />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className={EYEBROW}>Site</span>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">Journal</h1>
        </div>
      </header>

      <div className="mt-5 flex items-center border-b border-border pb-2">
        <Toolbar tabs={tabs} defaultTab="actions" searchPlaceholder="Compte, action, chemin…" />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            Icon={Activity}
            tone={q ? "filtered" : "idle"}
            title={q ? "Aucune ligne ne correspond" : `Rien dans « ${TAB_LABEL[tab]} »`}
          />
        </div>
      ) : (
        <ul className="mt-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[110px_1fr] items-baseline gap-4 border-b border-border py-2 sm:grid-cols-[150px_1fr_180px]"
            >
              <span className="batta-tabular text-[11.5px] text-subtle">
                {new Date(r.created_at).toLocaleString("fr-FR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <span className="min-w-0 text-[12.5px] text-foreground">
                {r.action ? (
                  ACTION_LABEL[r.action] ?? r.action
                ) : (
                  <span className="text-subtle">{r.path ?? r.type ?? "—"}</span>
                )}
                {r.status != null && r.status >= 400 && (
                  <span className="ms-2 text-[11.5px] font-semibold text-[#ef8681]">
                    {r.status}
                  </span>
                )}
              </span>
              <span className="hidden truncate text-[11.5px] text-subtle sm:block">
                {r.user_email ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <AdminPager page={page} totalPages={totalPages} />
    </AdminPage>
  );
}
