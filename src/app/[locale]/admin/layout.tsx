import { redirect } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminRail, AdminMobileBar, type AdminCounts } from "@/components/admin/AdminShell";

// Admin is auth-gated and per-request — never static. Forcing dynamic here
// covers EVERY admin route (so a new page can't accidentally be prerendered,
// which would run this layout's getServerSupabase() at build and fail when
// no Supabase env is present, e.g. CI without secrets). Most admin pages also
// declare this individually; the layout makes it impossible to forget.
export const dynamic = "force-dynamic";

/**
 * Admin console — gated to role=admin. Responsive shell: a sticky left rail on
 * desktop (lg+), a top bar + slide-over drawer on mobile/tablet. The consumer
 * chrome (TopBar / DesktopNav / BottomTabBar) is suppressed for /admin in
 * MobileShell, so this is the whole shell.
 *
 * The layout also carries the two badge counts in the nav. They are head-only
 * COUNTs (no rows fetched) and they run on every admin page — the cost is two
 * index lookups, and the payoff is that you can see there is a receipt waiting
 * without being on the screen that shows receipts.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect({ href: "/login", locale: locale as "fr" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    redirect({ href: "/", locale: locale as "fr" });
  }

  const head = (t: string) => supabase.from(t).select("*", { count: "exact", head: true });
  const [annonces, paiements] = await Promise.all([
    head("listings").eq("status", "pending_review"),
    head("payments").eq("status", "pending_review"),
  ]);
  const counts: AdminCounts = {
    annonces: annonces.count ?? 0,
    paiements: paiements.count ?? 0,
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AdminRail counts={counts} />
      <main className="min-w-0 flex-1">
        <AdminMobileBar counts={counts} />
        <div className="mx-auto max-w-[1320px] px-4 py-6 lg:px-9 lg:py-9">{children}</div>
      </main>
    </div>
  );
}
