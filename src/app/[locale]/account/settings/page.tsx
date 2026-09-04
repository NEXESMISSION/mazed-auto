import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { formatPhone, realEmail } from "@/lib/identity";
import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { SmsNotificationsToggle } from "@/components/account/SmsNotificationsToggle";
import { PasswordSection } from "./PasswordSection";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
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
  let phoneLabel: string | null = null;
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
        .select("sms_notifications_enabled, phone")
        .eq("id", user.id)
        .single();
      smsEnabled = profile?.sms_notifications_enabled ?? true;
      phoneLabel = formatPhone(profile?.phone ?? null);
    }
  } catch {
    // env missing — fall through to guest UI.
  }

  // A synthetic 216…@phone.mazedauto.app is not an e-mail the user has.
  const hasRealEmail = realEmail(userEmail) !== null;

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
        {/* Phone accounts have no e-mail to speak of — the address on the
            auth row is a synthetic 216…@phone.mazedauto.app that signup mints
            because Supabase requires one. Presenting it as "votre adresse
            e-mail … identifiant de connexion" was telling the user to sign in
            with an address that does not exist. Show the number instead, and
            keep the e-mail card only for accounts that really have one. */}
        <Section label={hasRealEmail ? "E-mail" : "Téléphone"}>
          <div className="flex items-center gap-3 p-4 lg:p-5">
            <IconBadge>
              <Mail className="size-5" strokeWidth={2} />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-foreground">
                {hasRealEmail ? "Adresse e-mail" : "Numéro de téléphone"}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {hasRealEmail ? userEmail : (phoneLabel ?? "—")}
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
              Vérifiée
            </span>
          </div>
          <Divider />
          <div className="p-4 lg:p-5">
            <p className="text-[12px] leading-relaxed text-muted">
              {hasRealEmail
                ? "Votre adresse e-mail sert d'identifiant de connexion. Pour la modifier, contactez notre support — chaque changement est vérifié manuellement pour protéger votre compte."
                : "Votre numéro de téléphone est votre identifiant de connexion, et c'est lui que les acheteurs voient sur vos annonces. Pour le modifier, contactez notre support — chaque changement est vérifié manuellement pour protéger votre compte."}
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

        {/* The identity-verification row is gone with the feature (0164).
            The comment that used to sit here already said /kyc/* was a dead
            end — the row was still rendered, so it promised a check that no
            longer exists and dropped the user back on their account page. */}

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
