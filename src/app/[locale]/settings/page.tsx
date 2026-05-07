"use client";

import { useState, useTransition } from "react";
import { Lock, Mail, Phone, Globe, Bell, Shield, Trash2, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const tLang = useTranslations("settings.language");
  const [, startTransition] = useTransition();
  const [notif, setNotif] = useState({ email: true, sms: false, push: true });

  function switchLocale(next: Locale) {
    if (next === currentLocale) return;
    // 1) Cookie + URL: next-intl router rewrites pathname under the new
    //    locale and writes NEXT_LOCALE so future requests stay there.
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
    // 2) Persist to user_metadata (option ب) so the choice follows the
    //    account across devices and is available to email/push later.
    //    Fire-and-forget — the cookie is authoritative for this session,
    //    and guests (no session) will simply 401 here without disruption.
    createClient()
      .auth.updateUser({ data: { locale: next } })
      .catch(() => {});
  }

  return (
    <AppShell noTopBar>
      <ScreenHeader title="Paramètres" backHref="/profile" />
      <div className="px-4 pb-8 space-y-5">

        {/* Account */}
        <Section title="Compte">
          <Row icon={<Lock className="h-4 w-4" />} label="Modifier Mot de passe" />
          <Row icon={<Mail className="h-4 w-4" />} label="Modifier E-mail" sub="med@example.com" />
          <Row icon={<Phone className="h-4 w-4" />} label="Modifier Téléphone" sub="+216 20 123 456" />
        </Section>

        {/* Language */}
        <Section title={tLang("title")}>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => switchLocale("ar")}
                className={`h-12 rounded-[var(--radius)] border-2 font-bold transition-colors ${
                  currentLocale === "ar"
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "border-[var(--border)] hover:border-[var(--gold-soft)]"
                }`}
              >
                🇹🇳 {tLang("arabic")}
              </button>
              <button
                onClick={() => switchLocale("fr")}
                className={`h-12 rounded-[var(--radius)] border-2 font-bold transition-colors ${
                  currentLocale === "fr"
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "border-[var(--border)] hover:border-[var(--gold-soft)]"
                }`}
              >
                🇫🇷 {tLang("french")}
              </button>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Toggle
            icon={<Bell className="h-4 w-4" />}
            label="Notifications de l'application"
            sub="Quand votre offre est dépassée ou que vous gagnez une enchère"
            on={notif.push}
            onChange={(v) => setNotif({ ...notif, push: v })}
          />
          <Toggle
            icon={<Mail className="h-4 w-4" />}
            label="Notifications par e-mail"
            sub="Résumé hebdomadaire + notifications importantes"
            on={notif.email}
            onChange={(v) => setNotif({ ...notif, email: v })}
          />
          <Toggle
            icon={<Phone className="h-4 w-4" />}
            label="Notifications par SMS"
            sub="Code OTP uniquement (pas de publicités)"
            on={notif.sms}
            onChange={(v) => setNotif({ ...notif, sms: v })}
          />
        </Section>

        {/* Privacy & Security */}
        <Section title="Confidentialité et sécurité">
          <Row
            icon={<Shield className="h-4 w-4" />}
            label="Activer l'authentification à deux facteurs"
            sub="Protection supplémentaire pour votre compte"
          />
          <Row
            icon={<Globe className="h-4 w-4" />}
            label="Sessions actives"
            sub="3 appareils connectés"
          />
        </Section>

        {/* Danger zone */}
        <Section title="Zone de danger">
          <Row
            icon={<Trash2 className="h-4 w-4 text-[var(--danger)]" />}
            label="Supprimer Mon compte"
            sub="Action irréversible"
            danger
          />
        </Section>
      </div>
    </AppShell>
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
    <section>
      <div className="text-xs font-bold text-[var(--foreground-muted)] uppercase mb-2 px-1">
        {title}
      </div>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  sub,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <button className="w-full p-4 flex items-center gap-3 hover:bg-[var(--surface-2)] transition-colors text-right">
      <div className={`shrink-0 ${danger ? "text-[var(--danger)]" : "text-[var(--gold)]"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm ${danger ? "text-[var(--danger)]" : ""}`}>
          {label}
        </div>
        {sub && (
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{sub}</div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)]" />
    </button>
  );
}

function Toggle({
  icon,
  label,
  sub,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="w-full p-4 flex items-center gap-3">
      <div className="shrink-0 text-[var(--gold)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        {sub && (
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{sub}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!on)}
        className={`shrink-0 h-6 w-11 rounded-full transition-colors relative ${
          on ? "bg-[var(--gold)]" : "bg-[var(--surface-3)]"
        }`}
        aria-label="toggle"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "left-0.5" : "right-0.5"
          }`}
        />
      </button>
    </div>
  );
}
