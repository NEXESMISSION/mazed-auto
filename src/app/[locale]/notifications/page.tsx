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
      {/* Mobile back row */}
      <div className="lg:hidden">
        <BackRow />
      </div>

      {/* Desktop magazine eyebrow strip */}
      <div className="hidden lg:block max-w-[var(--max-w-content)] mx-auto px-8 pt-10 pb-6">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          <Bell className="h-3.5 w-3.5" />
          Centre de notifications
        </div>
      </div>

      <div className="px-4 pb-8 space-y-4 lg:max-w-[var(--max-w-content)] lg:mx-auto lg:px-8 lg:pb-16">
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
