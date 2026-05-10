"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Lock,
  Mail,
  Phone,
  Bell,
  Shield,
  Trash2,
  ChevronRight,
  Globe,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname, Link } from "@/i18n/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

type NotifPrefs = { push: boolean; email: boolean; sms: boolean };
const DEFAULT_PREFS: NotifPrefs = { push: true, email: true, sms: false };

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const { user } = useAuth();
  const [, startTransition] = useTransition();

  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Notification preferences — read from user_metadata once on mount,
  // persist on every toggle.
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    if (!user) return;
    type Meta = { notifPrefs?: Partial<NotifPrefs> };
    const meta = (user as unknown as { user_metadata?: Meta }).user_metadata;
    if (meta?.notifPrefs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs({ ...DEFAULT_PREFS, ...meta.notifPrefs });
    }
  }, [user]);

  function switchLocale(next: Locale) {
    if (next === currentLocale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
    createClient()
      .auth.updateUser({ data: { locale: next } })
      .catch(() => {});
  }

  async function togglePref(key: keyof NotifPrefs, value: boolean) {
    const prev = prefs;
    const next = { ...prev, [key]: value };
    setPrefs(next);
    const { error } = await createClient().auth.updateUser({
      data: { notifPrefs: next },
    });
    if (error) {
      setPrefs(prev);
      toast(error.message, "error");
      return;
    }
    toast(tSettings("notifications.saved"), "success");
  }

  return (
    <AppShell noTopBar>
      <ScreenHeader title={tSettings("title")} backHref="/profile" />
      <div className="px-4 pb-8 space-y-5 lg:max-w-[var(--max-w-content)] lg:mx-auto lg:px-6">
        <Section title={tSettings("account.title")}>
          <Row
            icon={<Lock className="h-4 w-4" />}
            label={tSettings("account.password")}
            sub={tSettings("account.passwordHint")}
            onClick={() => setPwOpen(true)}
          />
          <Row
            icon={<Mail className="h-4 w-4" />}
            label={tSettings("account.email")}
            sub={user?.email}
            onClick={() => setEmailOpen(true)}
          />
          <Row
            icon={<Phone className="h-4 w-4" />}
            label={tSettings("account.phone")}
            sub={user?.phone || tSettings("account.phoneHint")}
            onClick={() => setPhoneOpen(true)}
          />
        </Section>

        <Section title={tSettings("language.title")}>
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
                🇹🇳 {tSettings("language.arabic")}
              </button>
              <button
                onClick={() => switchLocale("fr")}
                className={`h-12 rounded-[var(--radius)] border-2 font-bold transition-colors ${
                  currentLocale === "fr"
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "border-[var(--border)] hover:border-[var(--gold-soft)]"
                }`}
              >
                🇫🇷 {tSettings("language.french")}
              </button>
            </div>
          </div>
        </Section>

        <Section title={tSettings("notifications.title")}>
          <Toggle
            icon={<Bell className="h-4 w-4" />}
            label={tSettings("notifications.push")}
            sub={tSettings("notifications.pushSub")}
            on={prefs.push}
            onChange={(v) => togglePref("push", v)}
          />
          <Toggle
            icon={<Mail className="h-4 w-4" />}
            label={tSettings("notifications.email")}
            sub={tSettings("notifications.emailSub")}
            on={prefs.email}
            onChange={(v) => togglePref("email", v)}
          />
          <Toggle
            icon={<Phone className="h-4 w-4" />}
            label={tSettings("notifications.sms")}
            sub={tSettings("notifications.smsSub")}
            on={prefs.sms}
            onChange={(v) => togglePref("sms", v)}
          />
          <Row
            icon={<Bell className="h-4 w-4" />}
            label="Préférences détaillées"
            sub="Choisir par type d'événement et par canal"
            onClick={() => router.push("/settings/notifications")}
          />
        </Section>

        <Section title={tSettings("security.title")}>
          <Row
            icon={<Shield className="h-4 w-4" />}
            label={tSettings("security.twoFactor")}
            sub={tSettings("security.twoFactorSub")}
            comingSoon={tCommon("comingSoon")}
          />
          <Row
            icon={<Globe className="h-4 w-4" />}
            label={tSettings("security.sessions")}
            sub={tSettings("security.sessionsSub")}
            comingSoon={tCommon("comingSoon")}
          />
        </Section>

        <Section title={tSettings("danger.title")}>
          <Row
            icon={<Trash2 className="h-4 w-4 text-[var(--danger)]" />}
            label={tSettings("danger.deleteAccount")}
            sub={tSettings("danger.deleteAccountSub")}
            danger
            onClick={() => setDeleteOpen(true)}
          />
        </Section>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <EmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        currentEmail={user?.email}
      />
      <PhoneModal
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        currentPhone={user?.phone}
      />
      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </AppShell>
  );
}

/* ============================ Modals ============================ */

function PasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("settings.account");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pw.length < 8) {
      toast(t("passwordHint"), "warning");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(t("passwordChanged"), "success");
    setPw("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("password")} size="sm">
      <div className="space-y-3">
        <label className="block">
          <div className="text-xs font-bold text-[var(--foreground-muted)] mb-1.5">
            {t("newPassword")}
          </div>
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            autoFocus
          />
        </label>
        <p className="text-[11px] text-[var(--foreground-muted)]">
          {t("passwordHint")}
        </p>
      </div>
      <ModalFooter className="-mx-5 -mb-5 mt-5">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button size="md" onClick={submit} disabled={busy || pw.length < 8}>
          {busy ? tCommon("saving") : tCommon("save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function EmailModal({
  open,
  onClose,
  currentEmail,
}: {
  open: boolean;
  onClose: () => void;
  currentEmail?: string;
}) {
  const t = useTranslations("settings.account");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.includes("@")) return;
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ email });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(t("emailUpdateRequested"), "success");
    setEmail("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("email")} size="sm">
      <div className="space-y-3">
        {currentEmail && (
          <div className="text-xs text-[var(--foreground-muted)]">
            {currentEmail}
          </div>
        )}
        <label className="block">
          <div className="text-xs font-bold text-[var(--foreground-muted)] mb-1.5">
            {t("newEmail")}
          </div>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@example.com"
            autoFocus
          />
        </label>
        <p className="text-[11px] text-[var(--foreground-muted)]">
          {t("emailHint")}
        </p>
      </div>
      <ModalFooter className="-mx-5 -mb-5 mt-5">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="md"
          onClick={submit}
          disabled={busy || !email.includes("@")}
        >
          {busy ? tCommon("saving") : tCommon("save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PhoneModal({
  open,
  onClose,
  currentPhone,
}: {
  open: boolean;
  onClose: () => void;
  currentPhone?: string;
}) {
  const t = useTranslations("settings.account");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!phone.startsWith("+")) return;
    setBusy(true);
    const { error } = await createClient().auth.updateUser({
      data: { phone },
    });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(t("phoneUpdateRequested"), "success");
    setPhone("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("phone")} size="sm">
      <div className="space-y-3">
        {currentPhone && (
          <div className="text-xs text-[var(--foreground-muted)]">
            {currentPhone}
          </div>
        )}
        <label className="block">
          <div className="text-xs font-bold text-[var(--foreground-muted)] mb-1.5">
            {t("newPhone")}
          </div>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+216 20 123 456"
            autoFocus
          />
        </label>
        <p className="text-[11px] text-[var(--foreground-muted)]">
          {t("phoneHint")}
        </p>
      </div>
      <ModalFooter className="-mx-5 -mb-5 mt-5">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="md"
          onClick={submit}
          disabled={busy || !phone.startsWith("+")}
        >
          {busy ? tCommon("saving") : tCommon("save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("settings.danger");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("deleteConfirmTitle")}
      description={t("deleteConfirmBody")}
      size="sm"
    >
      <ModalFooter className="-mx-5 -mb-5 mt-2">
        <Button variant="ghost" size="md" onClick={onClose}>
          {t("deleteCancel")}
        </Button>
        <Link href="/help" onClick={onClose}>
          <Button variant="danger" size="md">
            {t("deleteContact")}
          </Button>
        </Link>
      </ModalFooter>
    </Modal>
  );
}

/* ============================ Layout helpers ============================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-2 px-1">
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
  comingSoon,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
  comingSoon?: string;
  onClick?: () => void;
}) {
  const disabled = Boolean(comingSoon);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full p-4 flex items-center gap-3 transition-colors text-start ${
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:bg-[var(--surface-2)]"
      }`}
    >
      <div
        className={`shrink-0 ${danger ? "text-[var(--danger)]" : "text-[var(--gold)]"}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`font-semibold text-sm ${danger ? "text-[var(--danger)]" : ""}`}
        >
          {label}
        </div>
        {sub && (
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5 line-clamp-1">
            {sub}
          </div>
        )}
      </div>
      {comingSoon ? (
        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--foreground-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2 py-0.5">
          {comingSoon}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)]" />
      )}
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
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
            {sub}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!on)}
        className={`shrink-0 h-6 w-11 rounded-full transition-colors relative ${
          on ? "bg-[var(--gold)]" : "bg-[var(--surface-3)]"
        }`}
        aria-label="toggle"
        aria-pressed={on}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
