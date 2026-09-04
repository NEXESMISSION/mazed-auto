import { redirect } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin/session";
import { AdminRail, AdminMobileBar, type AdminCounts } from "@/components/admin/AdminShell";

// Admin is auth-gated and per-request — never static. Forcing dynamic here
// covers EVERY admin route (so a new page can't accidentally be prerendered,
// which would run this layout's Supabase calls at build and fail when no
// Supabase env is present, e.g. CI without secrets). Most admin pages also
// declare this individually; the layout makes it impossible to forget.
export const dynamic = "force-dynamic";

/**
 * Admin console — gated to role=admin. Responsive shell: a sticky left rail on
 * desktop (lg+), a top bar + slide-over drawer on mobile/tablet. The consumer
 * chrome (TopBar / DesktopNav / BottomTabBar) is suppressed for /admin in
 * MobileShell, so this is the whole shell.
 *
 * Everything here runs on EVERY admin navigation, so the ordering matters more
 * than it looks. The badge counts are fired **before** the gate is awaited,
 * against the service client, so they overlap the ~225 ms identity check
 * instead of queueing behind it. If the visitor turns out not to be an admin
 * the counts are simply discarded — two head-only COUNTs of rows they never
 * see, in exchange for taking a serialized leg out of every single page load.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const service = getServiceSupabase();
  const head = (t: string) =>
    service ? service.from(t).select("*", { count: "exact", head: true }) : null;

  // Started, not awaited — these run while the gate below is resolving.
  const countsPromise = Promise.all([
    head("listings")?.eq("status", "pending_review") ?? Promise.resolve({ count: 0 }),
    head("payments")?.eq("status", "pending_review") ?? Promise.resolve({ count: 0 }),
  ]);

  const { locale } = await params;
  const { user, isAdmin } = await getAdminSession();

  if (!user) redirect({ href: "/login", locale: locale as "fr" });
  if (!isAdmin) redirect({ href: "/", locale: locale as "fr" });

  const [annonces, paiements] = await countsPromise;
  const counts: AdminCounts = {
    annonces: annonces.count ?? 0,
    paiements: paiements.count ?? 0,
  };

  // An application viewport, not a document: the shell fills the window once
  // and scrolling happens inside panes. That is what lets a split-pane screen
  // keep its list scrolled while the detail beside it changes — and it is why
  // there is deliberately no padding or max-width here. Document-shaped
  // screens opt into those with <AdminPage>; the annonces console lays out
  // its own two panes.
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AdminRail counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileBar counts={counts} />
        {/* The one scroll region for document-shaped screens. Padding lives
            here so the twenty screens not yet rebuilt keep their margins; a
            pane-based screen cancels it with FULL_BLEED and sizes itself to
            the viewport instead. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8 lg:py-7">
          {children}
        </div>
      </div>
    </div>
  );
}
