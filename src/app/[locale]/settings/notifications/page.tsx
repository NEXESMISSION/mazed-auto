import { getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { createClient } from "@/lib/supabase/server";
import { NotifPrefsForm } from "./NotifPrefsForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotifPrefsPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <AppShell noTopBar>
        <ScreenHeader title="Notifications" backHref="/settings" />
        <div className="p-4">
          <Link href="/login" className="text-[var(--gold)]">
            Connectez-vous pour gérer vos préférences
          </Link>
        </div>
      </AppShell>
    );
  }

  const [tplsRes, prefsRes] = await Promise.all([
    supabase
      .from("notification_templates")
      .select("kind, locale, title, in_app, email, sms, push")
      .eq("locale", locale),
    supabase
      .from("user_notification_prefs")
      .select("kind, in_app, email, sms, push")
      .eq("user_id", user.id),
  ]);

  const tpls = (tplsRes.data ?? []) as Array<{
    kind: string;
    locale: string;
    title: string;
    in_app: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  }>;
  const prefs = Object.fromEntries(
    ((prefsRes.data ?? []) as Array<{
      kind: string;
      in_app: boolean;
      email: boolean;
      sms: boolean;
      push: boolean;
    }>).map((p) => [p.kind, p]),
  );

  const items = tpls
    .sort((a, b) => a.kind.localeCompare(b.kind))
    .map((t) => ({
      kind: t.kind,
      title: t.title,
      defaults: {
        inApp: t.in_app,
        email: t.email,
        sms: t.sms,
        push: t.push,
      },
      override: prefs[t.kind]
        ? {
            inApp: prefs[t.kind].in_app,
            email: prefs[t.kind].email,
            sms: prefs[t.kind].sms,
            push: prefs[t.kind].push,
          }
        : null,
    }));

  return (
    <AppShell noTopBar>
      <ScreenHeader title="Notifications détaillées" backHref="/settings" />
      <div className="p-4 space-y-3 max-w-3xl mx-auto">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Préférences générales
        </Link>
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Choisissez par type d&apos;événement et par canal (in-app, push, email, SMS) ce que vous voulez recevoir. Les valeurs par défaut sont définies par la plateforme.
        </p>
        <NotifPrefsForm items={items} />
      </div>
    </AppShell>
  );
}
