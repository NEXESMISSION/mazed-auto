import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin";
import { AdminIdleTimer } from "@/components/admin/AdminIdleTimer";

/**
 * Server-side admin gate for every `/admin/*` route. Without this,
 * the admin shell + RLS-blocked data renders for any logged-in user
 * (counters show zero, tables look empty, but the chrome is exposed
 * — confusing, and a real authz hole if any RLS rule has a bug).
 *
 * Behavior:
 *  - Not signed in   → redirect to /login (preserve `?redirect=` so
 *    the user lands back on the admin path after authenticating).
 *  - Signed in, no admin role → 404. We deliberately don't say
 *    "forbidden" — the admin surface should be invisible to non-admins.
 *  - Admin → render children + idle-session watcher.
 *
 * Role resolution: super_admin / admin / moderator / support / finance
 * via `adminRole` in user_metadata, with back-compat fallback to the
 * legacy `role: "admin"` flag.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({
      href: "/login?redirect=/admin/dashboard",
      locale,
    });
    return null;
  }

  const role = getAdminRole(user);
  if (!role) {
    notFound();
  }

  return (
    <>
      <AdminIdleTimer locale={locale} />
      {children}
    </>
  );
}
