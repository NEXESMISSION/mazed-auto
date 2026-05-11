import { Link } from "@/i18n/navigation";
import {
  ShieldCheck,
  Settings,
  User as UserIcon,
  Gavel,
  Heart,
  Bell,
  Eye,
  ChevronRight,
  Trophy,
  Wallet,
  HelpCircle,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveSubscription,
  getListingsRemaining,
} from "@/lib/subscription";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell noTopBar>
        <ScreenHeader title="Mon profil" backHref="/" />
        <div className="px-4 text-center py-16 space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
            <UserIcon className="h-6 w-6" />
          </div>
          <div className="font-bold text-base">Connectez-vous pour voir votre profil</div>
          <Link href="/login">
            <Button size="md">Connexion</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const meta = (user.user_metadata ?? {}) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    kycStatus?: "none" | "pending" | "verified" | "rejected";
    role?: "buyer" | "seller" | "admin";
  };

  // Counts feed the badges next to each menu row.
  const [b, w, n, won, activeSub, freeListingsRemaining] = await Promise.all([
    supabase
      .from("bids")
      .select("auction_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("watchlist")
      .select("auction_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "final_payment")
      .eq("status", "completed"),
    getActiveSubscription(user.id).catch(() => null),
    // Free-tier counter — only meaningful when there's no active sub,
    // but always cheap to fetch (it's a single RPC).
    getListingsRemaining(user.id).catch(() => 0),
  ]);

  const counts = {
    bids: b.count ?? 0,
    watch: w.count ?? 0,
    notifs: n.count ?? 0,
    won: won.count ?? 0,
  };

  const role = meta.role ?? "buyer";
  const kycStatus = meta.kycStatus ?? "none";
  const fullName =
    [meta.firstName, meta.lastName].filter(Boolean).join(" ") ||
    user.email?.split("@")[0] ||
    "utilisateur";

  return (
    <AppShell noTopBar>
      {/* ScreenHeader is mobile-only — the global DesktopHeader handles
          desktop chrome via AppShell. */}
      <div className="lg:hidden">
        <ScreenHeader
          title="Mon compte"
          backHref="/"
          action={
            <Link
              href="/settings"
              aria-label="Paramètres"
              className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
          }
        />
      </div>

      {/* ============================================================
          MOBILE — original linear flow, untouched. Hidden on lg+.
          ============================================================ */}
      <div className="lg:hidden px-4 pb-8 space-y-5">
        <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar size="lg" alt={fullName} />
            {kycStatus === "verified" && (
              <span
                className="absolute -bottom-0.5 -end-0.5 h-5 w-5 rounded-full bg-[var(--gold)] border-2 border-[var(--surface)] flex items-center justify-center shadow-[var(--shadow-gold)]"
                title="Identité vérifiée"
              >
                <ShieldCheck className="h-3 w-3 text-black" strokeWidth={3} />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight truncate leading-tight">
              {fullName}
            </h1>
            <div className="text-[12px] text-[var(--foreground-muted)] truncate mt-0.5">
              {user.email}
            </div>
            {(role === "admin" || role === "seller") && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.15em]">
                {role === "admin" ? "Admin" : "Vendeur"}
              </div>
            )}
          </div>
        </section>

        {kycStatus !== "verified" && (
          <Link
            href={
              kycStatus === "pending" || kycStatus === "rejected"
                ? "/kyc/status"
                : "/kyc/start"
            }
            className="block rounded-2xl bg-[var(--gold-faint)] border border-[var(--gold)]/40 p-3.5 hover:bg-[var(--gold)] hover:text-black transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-[var(--gold)] text-black flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px] text-[var(--gold)] group-hover:text-black">
                  {kycStatus === "pending"
                    ? "Votre vérification est en cours d'examen"
                    : kycStatus === "rejected"
                      ? "Vérification refusée — réessayer"
                      : "Terminer la vérification d'identité"}
                </div>
                <div className="text-[11px] text-[var(--foreground-muted)] group-hover:text-black/70 mt-0.5">
                  {kycStatus === "pending"
                    ? "Nous vous notifierons dès la fin"
                    : kycStatus === "rejected"
                      ? "Voir le motif et soumettre à nouveau"
                      : "Pour participer aux enchères et vendre votre voiture"}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </div>
          </Link>
        )}

        <Link
          href={activeSub ? "/profile/subscription" : "/pricing"}
          className={`block rounded-2xl p-3.5 transition-colors group ${
            activeSub
              ? "bg-[var(--gold-faint)] border border-[var(--gold)]/30 hover:bg-[var(--gold)] hover:text-black"
              : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                activeSub
                  ? "bg-[var(--gold)] text-black"
                  : "bg-[var(--surface-2)] text-[var(--gold)]"
              }`}
            >
              <Trophy className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[13px]">
                {activeSub
                  ? `Plan ${activeSub.planName}`
                  : "Passer au compte professionnel"}
              </div>
              <div className="text-[11px] text-[var(--foreground-muted)] group-hover:text-black/70 mt-0.5">
                {activeSub
                  ? activeSub.listingsPerMonth === -1
                    ? "Mises en ligne illimitées"
                    : `${activeSub.listingsRemaining} / ${activeSub.listingsPerMonth} mises en ligne restantes`
                  : freeListingsRemaining > 0
                    ? `${freeListingsRemaining} gratuite${freeListingsRemaining > 1 ? "s" : ""} ce mois · upgrade pour plus`
                    : "Quota gratuit épuisé — passer Pro"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </div>
        </Link>

        <MenuCard label="Mon activité">
          <MenuRow
            href="/buyer/bids"
            icon={<Gavel className="h-4 w-4" />}
            label="Mes enchères"
            badge={counts.bids > 0 ? String(counts.bids) : undefined}
          />
          <MenuRow
            href="/buyer/bids?tab=won"
            icon={<Trophy className="h-4 w-4" />}
            label="Gagnées"
            badge={counts.won > 0 ? String(counts.won) : undefined}
          />
          <MenuRow
            href="/buyer/bids?tab=watchlist"
            icon={<Heart className="h-4 w-4" />}
            label="Favoris"
            badge={counts.watch > 0 ? String(counts.watch) : undefined}
          />
          <MenuRow
            href="/buyer/deposits"
            icon={<Wallet className="h-4 w-4" />}
            label="Mes cautions"
          />
        </MenuCard>

        {role !== "buyer" && (
          <MenuCard label="Vendeur">
            <MenuRow
              href="/seller/dashboard"
              icon={<Eye className="h-4 w-4" />}
              label="Tableau du vendeur"
            />
            <MenuRow
              href="/seller/auctions"
              icon={<Gavel className="h-4 w-4" />}
              label="Mes enchères"
            />
          </MenuCard>
        )}

        <MenuCard label="Général">
          <MenuRow
            href="/notifications"
            icon={<Bell className="h-4 w-4" />}
            label="Notifications"
            badge={counts.notifs > 0 ? String(counts.notifs) : undefined}
            badgeHighlight={counts.notifs > 0}
          />
          <MenuRow
            href="/settings"
            icon={<Settings className="h-4 w-4" />}
            label="Paramètres"
          />
          <MenuRow
            href="/help"
            icon={<HelpCircle className="h-4 w-4" />}
            label="Aide et questions"
          />
        </MenuCard>

        <div className="pt-1">
          <SignOutButton />
        </div>
      </div>

      {/* ============================================================
          DESKTOP — magazine layout: hero identity card with inline
          stats, KYC nudge banner, then a 2/3-col grid of menu cards.
          ============================================================ */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-8">
        {/* Header row — page title + settings shortcut */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
              Mon compte
            </div>
            <h1 className="mt-1.5 text-4xl xl:text-5xl font-black tracking-tight leading-none">
              Bonjour, <span className="gradient-gold-text">{fullName}</span>
            </h1>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] hover:text-[var(--gold)] text-sm font-bold transition-colors"
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </Link>
        </div>

        {/* Identity + stats hero card */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[#1a1408] ring-1 ring-[var(--gold)]/15 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-[var(--gold)] blur-3xl opacity-10"
          />
          <div className="relative grid grid-cols-[auto_1fr] gap-8 p-8 xl:p-10 items-center">
            {/* Avatar block */}
            <div className="relative shrink-0">
              <Avatar
                size="xl"
                alt={fullName}
                className="!h-24 !w-24 ring-2 ring-[var(--gold)]/40 shadow-[var(--shadow-gold)]"
              />
              {kycStatus === "verified" && (
                <span
                  className="absolute -bottom-1 -end-1 h-8 w-8 rounded-full bg-[var(--gold)] ring-2 ring-[var(--surface)] flex items-center justify-center shadow-[var(--shadow-gold)]"
                  title="Identité vérifiée"
                >
                  <ShieldCheck className="h-4 w-4 text-black" strokeWidth={3} />
                </span>
              )}
            </div>

            {/* Name + email + status pills */}
            <div className="min-w-0">
              <h2 className="text-2xl xl:text-3xl font-black tracking-tight truncate leading-tight">
                {fullName}
              </h2>
              <div className="text-sm text-[var(--foreground-muted)] truncate mt-1">
                {user.email}
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <KycChip status={kycStatus} />
                {(role === "admin" || role === "seller") && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/40 text-[10px] font-extrabold text-[var(--gold)] uppercase tracking-[0.18em]">
                    {role === "admin" ? "Admin" : "Vendeur Pro"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="relative grid grid-cols-4 divide-x divide-[var(--border)] border-t border-[var(--border)]">
            <StatTile
              Icon={Gavel}
              label="Enchères placées"
              value={counts.bids}
              href="/buyer/bids"
            />
            <StatTile
              Icon={Trophy}
              label="Voitures gagnées"
              value={counts.won}
              href="/buyer/bids?tab=won"
              accent={counts.won > 0}
            />
            <StatTile
              Icon={Heart}
              label="Favoris"
              value={counts.watch}
              href="/buyer/bids?tab=watchlist"
            />
            <StatTile
              Icon={Wallet}
              label="Mes cautions"
              value={null}
              href="/buyer/deposits"
              cta="Voir →"
            />
          </div>
        </section>

        {/* KYC nudge — only if not verified. Wide gold banner. */}
        {kycStatus !== "verified" && (
          <Link
            href={
              kycStatus === "pending" || kycStatus === "rejected"
                ? "/kyc/status"
                : "/kyc/start"
            }
            className="group relative block overflow-hidden rounded-[24px] bg-gradient-to-r from-[var(--gold-faint)] via-[var(--gold-faint)] to-transparent ring-1 ring-[var(--gold)]/40 hover:ring-[var(--gold)] transition-all p-6"
          >
            <div className="flex items-center gap-5">
              <span className="h-14 w-14 rounded-2xl bg-[var(--gold)] text-black flex items-center justify-center shrink-0 shadow-[var(--shadow-gold)]">
                <ShieldCheck className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                  Vérification d&apos;identité
                </div>
                <div className="mt-1 text-xl font-black tracking-tight">
                  {kycStatus === "pending"
                    ? "Votre vérification est en cours d'examen"
                    : kycStatus === "rejected"
                      ? "Vérification refusée — réessayer"
                      : "Terminez la vérification pour enchérir"}
                </div>
                <div className="text-sm text-[var(--foreground-muted)] mt-1">
                  {kycStatus === "pending"
                    ? "Nous vous notifierons dès la fin (24-48 h)"
                    : kycStatus === "rejected"
                      ? "Consultez le motif et soumettez à nouveau"
                      : "Deux minutes — c'est la dernière étape avant de placer votre première enchère"}
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--gold)] text-black font-extrabold text-sm shadow-[var(--shadow-gold)] group-hover:scale-[1.03] active:scale-[0.99] transition-transform">
                {kycStatus === "pending"
                  ? "Voir le statut"
                  : kycStatus === "rejected"
                    ? "Réessayer"
                    : "Commencer"}
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        )}

        {/* Subscription banner — visible on every desktop profile so the
            user can find their plan / upgrade path in one glance. Tone
            adapts to whether they're already subscribed. */}
        <Link
          href={activeSub ? "/profile/subscription" : "/pricing"}
          className={`group relative block overflow-hidden rounded-[24px] ring-1 transition-all p-6 ${
            activeSub
              ? "bg-gradient-to-r from-[var(--gold-faint)] via-[var(--gold-faint)] to-transparent ring-[var(--gold)]/40 hover:ring-[var(--gold)]"
              : "bg-gradient-to-r from-[var(--surface)] via-[var(--surface)] to-[var(--surface-2)]/30 ring-[var(--border)] hover:ring-[var(--gold-soft)]"
          }`}
        >
          <div className="flex items-center gap-5">
            <span
              className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
                activeSub
                  ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
                  : "bg-[var(--surface-2)] text-[var(--gold)]"
              }`}
            >
              <Sparkles className="h-6 w-6" strokeWidth={2.5} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
                {activeSub ? "Abonnement actif" : "Compte professionnel"}
              </div>
              <div className="mt-1 text-xl font-black tracking-tight">
                {activeSub
                  ? `Plan ${activeSub.planName}`
                  : "Passer au compte professionnel"}
              </div>
              <div className="text-sm text-[var(--foreground-muted)] mt-1">
                {activeSub
                  ? activeSub.listingsPerMonth === -1
                    ? "Mises en ligne illimitées · gérez votre abonnement"
                    : `${activeSub.listingsRemaining} / ${activeSub.listingsPerMonth} mises en ligne restantes ce mois`
                  : freeListingsRemaining > 0
                    ? `${freeListingsRemaining} mise${freeListingsRemaining > 1 ? "s" : ""} en ligne gratuite${freeListingsRemaining > 1 ? "s" : ""} ce mois · upgrade pour plus`
                    : "Quota gratuit épuisé ce mois — passez Pro pour plus de mises en ligne, boutique, badge vendeur de confiance"}
              </div>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-2 h-12 px-6 rounded-full font-extrabold text-sm group-hover:scale-[1.03] active:scale-[0.99] transition-transform ${
                activeSub
                  ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
                  : "ring-1 ring-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold-faint)]"
              }`}
            >
              {activeSub ? "Voir mon abonnement" : "Voir les plans"}
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        {/* Menu grid — 2 columns by default, 3 when the user is a seller */}
        <div
          className={
            role !== "buyer"
              ? "grid grid-cols-3 gap-6"
              : "grid grid-cols-2 gap-6"
          }
        >
          <DesktopMenuCard label="Mon activité" Icon={Gavel}>
            <DesktopMenuRow
              href="/buyer/bids"
              Icon={Gavel}
              label="Mes enchères"
              sub="Toutes vos offres en cours"
              badge={counts.bids > 0 ? String(counts.bids) : undefined}
            />
            <DesktopMenuRow
              href="/buyer/bids?tab=won"
              Icon={Trophy}
              label="Gagnées"
              sub="Les voitures que vous avez remportées"
              badge={counts.won > 0 ? String(counts.won) : undefined}
            />
            <DesktopMenuRow
              href="/buyer/bids?tab=watchlist"
              Icon={Heart}
              label="Favoris"
              sub="Suivies sans encore enchérir"
              badge={counts.watch > 0 ? String(counts.watch) : undefined}
            />
            <DesktopMenuRow
              href="/buyer/deposits"
              Icon={Wallet}
              label="Mes cautions"
              sub="Cautions versées et remboursements"
            />
          </DesktopMenuCard>

          {role !== "buyer" && (
            <DesktopMenuCard label="Vendeur" Icon={Eye}>
              <DesktopMenuRow
                href="/seller/dashboard"
                Icon={Eye}
                label="Tableau du vendeur"
                sub="Vue d'ensemble de vos ventes"
              />
              <DesktopMenuRow
                href="/seller/auctions"
                Icon={Gavel}
                label="Mes annonces"
                sub="Enchères publiées et leurs résultats"
              />
              <DesktopMenuRow
                href="/seller/new/step-1"
                Icon={ArrowUpRight}
                label="Publier une nouvelle annonce"
                sub="5 étapes — vérification + mise en ligne"
                accent
              />
            </DesktopMenuCard>
          )}

          <DesktopMenuCard label="Général" Icon={Settings}>
            <DesktopMenuRow
              href="/notifications"
              Icon={Bell}
              label="Notifications"
              sub="Alertes outbid, gain, paiement"
              badge={counts.notifs > 0 ? String(counts.notifs) : undefined}
              badgeHighlight={counts.notifs > 0}
            />
            <DesktopMenuRow
              href="/settings"
              Icon={Settings}
              label="Paramètres"
              sub="Compte, langue, confidentialité"
            />
            <DesktopMenuRow
              href="/help"
              Icon={HelpCircle}
              label="Aide et questions"
              sub="Guide complet et support"
            />
          </DesktopMenuCard>
        </div>

        {/* Sign out — single right-aligned button at the bottom */}
        <div className="flex justify-end pt-2">
          <div className="w-full max-w-sm">
            <SignOutButton />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/** Small KYC status chip used in the desktop hero. */
function KycChip({
  status,
}: {
  status: "none" | "pending" | "verified" | "rejected";
}) {
  const palette: Record<typeof status, string> = {
    none: "bg-[var(--surface-2)] text-[var(--foreground-muted)] ring-[var(--border)]",
    pending: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
    verified: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
    rejected: "bg-red-500/15 text-red-300 ring-red-500/40",
  };
  const label: Record<typeof status, string> = {
    none: "KYC non démarré",
    pending: "KYC en cours",
    verified: "KYC vérifié",
    rejected: "KYC rejeté",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full ring-1 text-[10px] font-extrabold uppercase tracking-[0.18em] ${palette[status]}`}
    >
      <ShieldCheck className="h-3 w-3" />
      {label[status]}
    </span>
  );
}

/** Desktop hero stat tile — clickable, big number + caption. */
function StatTile({
  Icon,
  label,
  value,
  href,
  accent,
  cta,
}: {
  Icon: LucideIcon;
  label: string;
  value: number | null;
  href: string;
  accent?: boolean;
  cta?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative px-7 py-6 hover:bg-[var(--surface-2)] transition-colors flex items-center gap-4"
    >
      <span
        className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          accent
            ? "bg-[var(--gold)] text-black shadow-[var(--shadow-gold)]"
            : "bg-[var(--surface-2)] text-[var(--foreground-muted)] group-hover:text-[var(--gold)]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          {label}
        </div>
        <div className="mt-1 text-2xl xl:text-[28px] font-black tabular-nums leading-none text-foreground">
          {value === null ? cta : value}
        </div>
      </div>
    </Link>
  );
}

/** Desktop menu card — bigger padding, label header, divided rows. */
function DesktopMenuCard({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border)] flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30 text-[var(--gold)] flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
          {label}
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

function DesktopMenuRow({
  href,
  Icon,
  label,
  sub,
  badge,
  badgeHighlight,
  accent,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
  sub?: string;
  badge?: string;
  badgeHighlight?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--surface-2)] transition-colors group"
    >
      <span
        className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          accent
            ? "bg-[var(--gold)] text-black"
            : "bg-[var(--surface-2)] text-[var(--foreground-muted)] group-hover:text-[var(--gold)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-tight">{label}</div>
        {sub && (
          <div className="text-[12px] text-[var(--foreground-muted)] mt-0.5 truncate">
            {sub}
          </div>
        )}
      </div>
      {badge && (
        <span
          className={`min-w-[24px] h-6 px-2 rounded-full text-[11px] font-extrabold flex items-center justify-center tabular-nums ${
            badgeHighlight
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface-2)] text-[var(--foreground-muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          {badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] shrink-0" />
    </Link>
  );
}

/** Mobile section card holding a divided list of MenuRows. */
function MenuCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] mb-2 px-1">
        {label}
      </div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

/**
 * Single tap-target row inside a MenuCard. Icon + label + optional badge +
 * trailing chevron. Badge is a count pill (gold when highlight, neutral
 * otherwise). Hover state matches the rest of the app — surface-2 background.
 */
function MenuRow({
  href,
  icon,
  label,
  badge,
  badgeHighlight,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeHighlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-2)] transition-colors group"
    >
      <span className="h-8 w-8 rounded-lg bg-[var(--surface-2)] text-[var(--foreground-muted)] group-hover:text-[var(--gold)] flex items-center justify-center shrink-0 transition-colors">
        {icon}
      </span>
      <span className="flex-1 min-w-0 text-sm font-semibold truncate">
        {label}
      </span>
      {badge && (
        <span
          className={`min-w-[22px] h-[22px] px-2 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums ${
            badgeHighlight
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]"
          }`}
        >
          {badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] shrink-0" />
    </Link>
  );
}
