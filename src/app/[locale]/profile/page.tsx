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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
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
  const [b, w, n, won] = await Promise.all([
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

      <div className="px-4 pb-8 space-y-5">
        {/* Identity card — avatar left, name/email/role on the right */}
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
            {/* Role badge — buyers don't get one, since "Acheteur" on
                everyone's profile reads as noise. Only Admin and Vendeur
                surface here, where the badge actually means something. */}
            {(role === "admin" || role === "seller") && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/30 text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.15em]">
                {role === "admin" ? "Admin" : "Vendeur"}
              </div>
            )}
          </div>
        </section>

        {/* KYC nudge — only shown when the user hasn't verified yet.
            Route by state:
              none/null  → /kyc/start  (intro + start the flow)
              pending    → /kyc/status (wait screen, 1-2 days banner)
              rejected   → /kyc/status (rejected screen with Retry CTA)
            Without this, the "your verification is being reviewed" link
            sent the user back to the "Before you begin" page, which made
            no sense. */}
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

        {/* Activity menu — single column, divided rows. The standard mobile
            profile pattern: tap to deep-link into each section. */}
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

        {/* Sign out — danger styling, sits alone */}
        <div className="pt-1">
          <SignOutButton />
        </div>
      </div>
    </AppShell>
  );
}

/** Section card holding a divided list of MenuRows. */
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
