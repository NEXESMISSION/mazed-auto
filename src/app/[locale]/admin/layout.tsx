import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side admin gate for every `/admin/*` route. Without this,
 * the admin shell + RLS-blocked data renders for any logged-in user
 * (counters show zero, tables look empty, but the chrome is exposed
 * — confusing, and a real authz hole if any RLS rule has a bug).
 *
 * Behavior:
 *  - Not signed in   → redirect to /login (preserve `?redirect=` so
 *    the user lands back on the admin path after authenticating).
 *  - Signed in, not admin → 404. We deliberately don't say "forbidden"
 *    — the admin surface should be invisible to non-admins, not
 *    advertised behind a "you can't enter" wall.
 *  - Admin → render children.
 *
 * Role lives in `user_metadata.role` and matches the SQL `is_admin()`
 * helper used by RLS (see migrate-rls-admin-fix.sql).
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
    // `redirect()` from next-intl is typed `void`, not `never`, so TS
    // doesn't narrow `user` below this branch. Explicit return makes
    // the narrowing flow forward.
    return null;
  }

  const role = (user.user_metadata?.role ?? "buyer") as
    | "buyer"
    | "seller"
    | "admin";
  if (role !== "admin") {
    notFound();
  }

  return <>{children}</>;
}
