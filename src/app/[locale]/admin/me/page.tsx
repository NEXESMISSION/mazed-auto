import { redirect } from "@/i18n/navigation";
import { Activity, Mail, Shield, Clock } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin";
import { Link } from "@/i18n/navigation";
import { MeChangePassword } from "./MeChangePassword";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login?redirect=/admin/me", locale });
    return null;
  }
  const role = getAdminRole(user);
  if (!role) {
    redirect({ href: "/", locale });
    return null;
  }

  const [summaryRes, recentActions, sessions] = await Promise.all([
    supabase.rpc("admin_self_summary").maybeSingle<{
      admin_role: string;
      email: string;
      display_name: string;
      recent_actions: number;
      last_seen: string | null;
    }>(),
    supabase
      .from("admin_audit_log")
      .select("id, action, target_user_id, target_auction_id, detail, created_at")
      .eq("actor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("admin_sessions")
      .select("session_id, last_seen, ip_address, user_agent, created_at")
      .eq("user_id", user.id)
      .order("last_seen", { ascending: false })
      .limit(10),
  ]);

  const s = summaryRes.data ?? {
    admin_role: role,
    email: user.email ?? "",
    display_name: user.email?.split("@")[0] ?? "(sans nom)",
    recent_actions: 0,
    last_seen: null,
  };

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-3xl">
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
          <div className="flex items-center gap-4">
            <Avatar size="xl" alt={s.display_name} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-extrabold">
                {s.display_name}
              </h1>
              <div className="text-sm text-[var(--foreground-muted)] truncate">
                {s.email}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="gold" size="sm">
                  <Shield className="h-3 w-3" />
                  {s.admin_role}
                </Badge>
                {s.last_seen && (
                  <Badge size="sm" variant="default">
                    <Clock className="h-3 w-3" />
                    {new Date(s.last_seen).toLocaleString("fr-FR")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat
            label="Actions (30j)"
            value={String(s.recent_actions)}
            icon={<Activity className="h-4 w-4" />}
          />
          <Stat
            label="Sessions actives"
            value={String((sessions.data ?? []).length)}
            icon={<Clock className="h-4 w-4" />}
          />
          <Stat
            label="Email"
            value={s.email.split("@")[0]}
            icon={<Mail className="h-4 w-4" />}
          />
        </div>

        <Section title="Mot de passe">
          <MeChangePassword />
        </Section>

        <Section title="2FA — bientôt disponible">
          <p className="text-xs text-[var(--foreground-muted)]">
            La double authentification est obligatoire pour les rôles admin
            (PLAN §22.3). En attendant, gardez un mot de passe long et un
            mot-clef unique par session.
          </p>
          <button
            disabled
            className="mt-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] text-xs opacity-60 cursor-not-allowed"
          >
            Activer la 2FA (à venir)
          </button>
        </Section>

        <Section title={`Mes 20 dernières actions`}>
          {(recentActions.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-2 text-center">
              Aucune action enregistrée.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentActions.data?.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[180px_1fr_auto] gap-3 py-2.5 text-sm items-start"
                >
                  <code className="font-mono text-xs font-bold">
                    {r.action}
                  </code>
                  <div className="text-xs">
                    {r.detail ?? "—"}
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {r.target_user_id && (
                        <Link
                          href={`/admin/users/${r.target_user_id}`}
                          className="text-[10px] text-[var(--gold)] hover:underline"
                        >
                          User → {r.target_user_id.slice(0, 8)}
                        </Link>
                      )}
                      {r.target_auction_id && (
                        <Link
                          href={`/admin/auctions/${r.target_auction_id}`}
                          className="text-[10px] text-[var(--gold)] hover:underline"
                        >
                          Auction → {r.target_auction_id.slice(0, 8)}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Sessions admin récentes">
          {(sessions.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)] py-2 text-center">
              Aucune session enregistrée.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {sessions.data?.map((sess) => (
                <div
                  key={sess.session_id}
                  className="grid grid-cols-[1fr_auto] gap-2 py-2 text-xs"
                >
                  <div>
                    <div className="font-mono text-[10px] text-[var(--foreground-muted)]">
                      {sess.session_id.slice(0, 12)}
                    </div>
                    {sess.user_agent && (
                      <div className="text-[10px] text-[var(--foreground-subtle)] line-clamp-1">
                        {sess.user_agent}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums whitespace-nowrap">
                    {new Date(sess.last_seen).toLocaleString("fr-FR")}
                  </div>
                </div>
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
      <h2 className="text-base font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
