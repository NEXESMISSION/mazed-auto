"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Gavel,
  AlertTriangle,
  BarChart3,
  LogOut,
  Receipt,
  Settings,
  FileText,
  Banknote,
  Ban,
  Activity,
  Megaphone,
  Inbox,
  Wrench,
  ShieldAlert,
  TrendingUp,
  Crown,
  MessageSquare,
  UserCog,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped so the mobile drawer is scannable and the desktop sidebar
// reads top-to-bottom by intent rather than 22 flat rows.
const GROUPS: NavGroup[] = [
  {
    label: "Vue d'ensemble",
    items: [
      { href: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analyses", icon: BarChart3 },
      { href: "/admin/insights", label: "Insights", icon: TrendingUp },
      { href: "/admin/activity", label: "Activité", icon: Activity },
    ],
  },
  {
    label: "Modération",
    items: [
      { href: "/admin/auctions-queue", label: "Enchères à modérer", icon: Gavel },
      { href: "/admin/kyc-queue", label: "File KYC", icon: ShieldCheck },
      { href: "/admin/ownership-review", label: "Vérif. propriété", icon: ShieldCheck },
      { href: "/admin/reports", label: "Signalements", icon: AlertTriangle },
      { href: "/admin/fraud", label: "Signaux fraude", icon: ShieldAlert },
      { href: "/admin/messages", label: "Modération msg", icon: MessageSquare },
      { href: "/admin/contact-inbox", label: "Boîte contact", icon: Inbox },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/transactions", label: "Transactions", icon: Receipt },
      { href: "/admin/payouts", label: "Virements", icon: Banknote },
      { href: "/admin/forfeits", label: "Cautions retenues", icon: Ban },
      { href: "/admin/subscriptions", label: "Abonnements", icon: Sparkles },
    ],
  },
  {
    label: "Utilisateurs",
    items: [
      { href: "/admin/users", label: "Utilisateurs", icon: Users },
      { href: "/admin/admins", label: "Équipe admin", icon: Crown },
    ],
  },
  {
    label: "Plateforme",
    items: [
      { href: "/admin/broadcasts", label: "Annonces", icon: Megaphone },
      { href: "/admin/cms", label: "Contenu", icon: FileText },
      { href: "/admin/system", label: "Système", icon: Wrench },
      { href: "/admin/settings", label: "Paramètres", icon: Settings },
      { href: "/admin/me", label: "Mon profil admin", icon: UserCog },
    ],
  },
];

interface Props {
  children: React.ReactNode;
}

export function AdminShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, user } = useAuth();
  const t = useTranslations("nav");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on route change so the next page doesn't render
  // behind the overlay. Deferred via queueMicrotask because React 19's
  // purity rule disallows synchronous setState in an effect body.
  useEffect(() => {
    queueMicrotask(() => setDrawerOpen(false));
  }, [pathname]);

  // Lock body scroll while drawer is open (it overlays content on mobile).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = drawerOpen ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  async function handleSignOut() {
    setDrawerOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  }

  // Current page label drives the mobile top bar so the admin always
  // knows where they are without opening the drawer.
  const flatItems = GROUPS.flatMap((g) => g.items);
  const activeItem =
    flatItems.find((i) => pathname.startsWith(i.href)) ?? flatItems[0];

  // AppUser already flattens user_metadata into top-level fields
  // (firstName / lastName / role) in lib/auth-shared.ts#mapUser. The
  // adminRole isn't on AppUser yet, so we still read it from
  // user_metadata defensively.
  const adminName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email?.split("@")[0] ||
    "Admin";
  const adminRole = (
    (user as unknown as { user_metadata?: { adminRole?: string } } | null)
      ?.user_metadata as { adminRole?: string } | undefined
  )?.adminRole;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* ─────────────── MOBILE TOP BAR ─────────────── */}
      <header className="md:hidden sticky top-0 z-30 bg-[var(--surface)]/95 backdrop-blur-xl border-b border-[var(--border)] h-14 flex items-center px-3 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Menu"
          className="h-10 w-10 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center active:scale-95 transition-transform"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 min-w-0 flex-1"
          aria-label="Accueil"
        >
          <div className="h-8 w-8 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--gold)] leading-none">
              Admin
            </div>
            <div className="text-sm font-bold truncate leading-tight mt-0.5">
              {activeItem.label}
            </div>
          </div>
        </Link>
      </header>

      {/* ─────────────── MOBILE DRAWER ─────────────── */}
      {drawerOpen && (
        <button
          aria-label="Fermer le menu"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
        />
      )}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 start-0 z-50 w-[min(86vw,320px)] bg-[var(--surface)] border-e border-[var(--border)] flex flex-col transition-transform duration-200 ease-out",
          drawerOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
        )}
        aria-hidden={!drawerOpen}
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 min-w-0 flex-1"
            onClick={() => setDrawerOpen(false)}
          >
            <div className="h-9 w-9 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="font-bold gradient-gold-text">Admin</div>
              <div className="text-[10px] text-[var(--foreground-muted)] truncate">
                {adminName}
                {adminRole && (
                  <span className="ms-1 text-[var(--gold)] font-bold uppercase tracking-wider">
                    · {adminRole}
                  </span>
                )}
              </div>
            </div>
          </Link>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Fermer"
            className="h-9 w-9 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-subtle)]">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 h-11 rounded-[var(--radius)] text-sm font-semibold transition-colors",
                      active
                        ? "bg-[var(--gold)] text-black"
                        : "text-foreground hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--border)]">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 h-11 w-full rounded-[var(--radius)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("signOut") || "Déconnexion"}
          </button>
        </div>
      </aside>

      {/* ─────────────── DESKTOP SIDEBAR ─────────────── */}
      <aside className="hidden md:flex md:w-64 md:border-e md:border-[var(--border)] md:bg-[var(--surface)] md:sticky md:top-0 md:h-screen md:overflow-y-auto md:flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="font-bold gradient-gold-text">Admin</div>
              <div className="text-[10px] text-[var(--foreground-muted)] truncate">
                {adminName}
                {adminRole && (
                  <span className="ms-1 text-[var(--gold)] font-bold uppercase tracking-wider">
                    · {adminRole}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-subtle)]">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 h-10 rounded-[var(--radius)] text-sm font-semibold transition-colors",
                      active
                        ? "bg-[var(--gold)] text-black"
                        : "text-[var(--foreground-muted)] hover:text-foreground hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--border)]">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 h-10 w-full rounded-[var(--radius)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("signOut") || "Déconnexion"}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
