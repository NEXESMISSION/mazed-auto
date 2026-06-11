import type { Metadata } from "next";
import { redirect, Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { Bell } from "lucide-react";
import {
  NotificationsClient,
  type NotificationItem,
  PAGE_SIZE,
} from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Notifications — Mazed Auto",
  description:
    "Centre de notifications : suivez vos enchères, paiements, annonces et alertes en temps réel.",
};

// Per-user, auth-gated — never static.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Centre de notifications — the full-page sibling of the header bell.
 *
 * Server component prefetches the first page straight from the same
 * `notifications` table the /api/notifications route reads (same columns,
 * same user filter, same ordering), so the list paints without a client
 * fetch. The client then paginates + marks-read through the existing
 * /api/notifications route — no new API surface.
 */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: locale as "ar" | "fr" | "en" });

  // Mirrors GET /api/notifications: explicit user filter (admins' RLS can
  // see every row system-wide — without this an admin would see other
  // users' notifications here too).
  const [{ data }, countRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, title, body, link, payload, read_at, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .is("read_at", null),
  ]);

  const items = (data ?? []) as NotificationItem[];
  const unreadCount = countRes.count ?? 0;

  const header = (
    <>
      <span className="batta-eyebrow inline-flex items-center gap-2">
        <Bell className="size-3.5" strokeWidth={2.4} />
        Centre de notifications
      </span>
      <h1 className="mt-1.5 text-[24px] font-extrabold leading-tight tracking-tight">
        Notifications
      </h1>
      <p className="mt-1.5 text-[12px] text-muted">
        Enchères, paiements, annonces et alertes — tout au même endroit.
      </p>
    </>
  );

  // Truly empty inbox — branded gold-framed card, same recipe as the
  // payments page empty state.
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[var(--max-w)] px-4 pt-4 pb-16 lg:max-w-[var(--max-w-content)]">
        {header}
        <div className="batta-frame-gold relative mt-6 px-6 py-10 text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-gold-faint">
            <Bell className="size-6 text-gold" strokeWidth={1.8} />
          </span>
          <p className="mt-4 text-[14px] font-bold text-foreground">
            Aucune notification
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            Tout est calme. Allez jeter un œil aux enchères.
          </p>
          <div className="mt-5">
            <Link
              href="/properties"
              className="batta-btn-luxe tap-target inline-flex px-5 py-2.5 text-[12.5px]"
            >
              Explorer les enchères
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-4 pt-4 pb-16 lg:max-w-[var(--max-w-content)]">
      {header}
      <NotificationsClient
        initial={items}
        initialUnread={unreadCount}
        initialHasMore={items.length === PAGE_SIZE}
      />
    </div>
  );
}
