import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { SmsNotificationsToggle } from "@/components/account/SmsNotificationsToggle";
import { PasswordSection } from "./PasswordSection";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  ShieldCheck,
  LifeBuoy,
  AlertTriangle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Paramètres du compte — Mazed Auto",
  description:
    "Gérez votre mot de passe, votre adresse e-mail et la sécurité de votre compte Mazed Auto.",
};

// Per-user, auth-gated — never static (env-less prerender would throw).
export const dynamic = "force-dynamic";

/**
 * /account/settings — security & account hygiene, split out of the
 * account hub. Same visual rhythm as /account: eyebrow label above a
 * dark surface card per section. Only real backend capabilities are
 * surfaced (password change, e-mail via support, KYC, deletion) — no
 * decorative toggles.
 */
export default async function SettingsPage() {
  const locale = await getLocale();
  const isRTL = locale === "ar";
  const ChevronStart = isRTL ? ChevronRight : ChevronLeft;
  const ChevronEnd = isRTL ? ChevronLeft : ChevronRight;

  // Fail-soft: Supabase env missing in dev → render the guest prompt.
  let userId: string | null = null;
  let userEmail: string | null = null;
  let kycStatus = "none";
  let smsEnabled = true;
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("kyc_status, sms_notifications_enabled")
        .eq("id", user.id)
        .single();
      kycStatus = profile?.kyc_status ?? "none";
      smsEnabled = profile?.sms_notifications_enabled ?? true;
    }
  } catch {
    // env missing — fall through to guest UI.
  }

  if (!userId) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-[var(--max-w)] flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-surface ring-1 ring-border shadow-[var(--shadow-md)]">
          <div aria-hidden className="batta-gradient-gold h-[2px] w-full" />
          <div className="p-7 text-center sm:p-8">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">
              <span className="gradient-gold-text">Paramètres</span>
            </h1>
            <p className="mt-2 text-[12.5px] text-muted">
              Connectez-vous pour gérer la sécurité de votre compte.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href="/login"
                className="batta-btn-luxe tap-target w-full px-6 py-3 text-[14px]"
              >
                Se connecter
              </Link>
              <Link
                href="/signup"
                className="batta-btn-ghost-gold tap-target w-full px-6 py-3 text-[14px]"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const kycHref =
    kycStatus === "verified" || kycStatus === "submitted" || kycStatus === "pending"
      ? "/kyc/status"
      : "/kyc/start";
  const kycSub =
    kycStatus === "verified"
      ? "Identité vérifiée"
      : kycStatus === "submitted"
        ? "En cours de vérification"
        : kycStatus === "pending"
          ? "Vérification en attente"
          : kycStatus === "rejected"
            ? "Vérification refusée — soumettre à nouveau"
            : "Vérification requise pour enchérir et vendre";

  return (
    <div className="mx-auto w-full max-w-[var(--max-w)] px-4 py-6 lg:max-w-3xl lg:px-8 lg:py-10">
      {/* Back link — same recipe as the legal pages, pointed at the hub. */}
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        <ChevronStart className="size-4" /> Mon compte
      </Link>

      <span className="batta-eyebrow mt-5 block">Compte</span>
      <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight lg:text-[30px]">
        Paramètres
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Mot de passe, e-mail et sécurité — tout au même endroit.
      </p>

      <div className="mt-7 space-y-7">
        {/* ── Mot de passe ─────────────────────────────────────────── */}
        <Section label="Mot de passe">
          <PasswordSection email={userEmail} />
        </Section>

        {/* ── E-mail ───────────────────────────────────────────────── */}
        <Section label="E-mail">
          <div className="flex items-center gap-3 p-4 lg:p-5">
            <IconBadge>
              <Mail className="size-5" strokeWidth={2} />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-foreground">
                Adresse e-mail
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {userEmail ?? "Compte sans adresse e-mail"}
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
              Vérifiée
            </span>
          </div>
          <Divider />
          <div className="p-4 lg:p-5">
            <p className="text-[12px] leading-relaxed text-muted">
              Votre adresse e-mail sert d&apos;identifiant de connexion et reçoit
              les confirmations d&apos;enchères. Pour la modifier, contactez notre
              support — chaque changement est vérifié manuellement pour protéger
              votre compte.
            </p>
            <Link
              href="/contact"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-gold transition hover:text-gold-bright"
            >
              <LifeBuoy className="size-4" strokeWidth={2} />
              Contacter le support
              <ChevronEnd className="size-3.5" />
            </Link>
          </div>
        </Section>

        {/* ── Notifications ────────────────────────────────────────── */}
        <Section label="Notifications">
          <SmsNotificationsToggle initial={smsEnabled} />
        </Section>

        {/* ── Compte ───────────────────────────────────────────────── */}
        <Section label="Compte">
          <Link
            href={kycHref as `/${string}`}
            className="tap-target flex items-center gap-3 p-4 transition hover:bg-surface-2 active:bg-surface-2 lg:p-5"
          >
            <IconBadge>
              <ShieldCheck className="size-5" strokeWidth={2} />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-foreground">
                Vérification d&apos;identité
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">{kycSub}</div>
            </div>
            <ChevronEnd className="size-5 shrink-0 text-muted" />
          </Link>
        </Section>

        {/* ── Zone de danger ───────────────────────────────────────── */}
        <section>
          <p className="batta-eyebrow mb-2 text-[var(--danger)]">Zone de danger</p>
          <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-[var(--danger)]/30">
            <div className="flex items-start gap-3 p-4 lg:p-5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--danger)]/10 text-[var(--danger)]">
                <AlertTriangle className="size-5" strokeWidth={2} />
              </span>
              <p className="text-[12px] leading-relaxed text-muted">
                La suppression de votre compte est définitive : vos données
                personnelles et vos pièces d&apos;identité sont effacées. Les
                opérations en cours (annonce en enchère, enchère remportée non
                réglée, paiement ou virement en attente) doivent être soldées
                avant.
              </p>
            </div>
            <Divider />
            <div className="p-3 lg:p-4">
              <DeleteAccountButton label="Supprimer mon compte" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── layout helpers ───────────────────────── */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="batta-eyebrow mb-2">{label}</p>
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {children}
      </div>
    </section>
  );
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-faint text-gold ring-1 ring-gold/30">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border" />;
}
