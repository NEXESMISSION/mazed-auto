import { Link } from "@/i18n/navigation";
import { Bell, ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/db";
import { NotificationsList } from "./NotificationsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell noTopBar>
        <BackRow />
        <div className="px-4 text-center py-16 space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
            <Bell className="h-6 w-6" />
          </div>
          <div className="font-bold text-base">Connectez-vous pour voir vos notifications</div>
          <Link href="/login">
            <Button size="md">Connexion</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const initial = await listNotifications(supabase, user.id);

  return (
    <AppShell noTopBar>
      <BackRow />
      <div className="px-4 pb-8 space-y-4">
        <NotificationsList userId={user.id} initial={initial} />
      </div>
    </AppShell>
  );
}

/**
 * Slim back row above the page content. Title is rendered by NotificationsList
 * (which also owns the "mark all read" button alongside it), so we only
 * surface a back affordance here.
 */
function BackRow() {
  return (
    <div className="px-4 pt-4 pb-1">
      <Link
        href="/"
        aria-label="Retour"
        className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
    </div>
  );
}
