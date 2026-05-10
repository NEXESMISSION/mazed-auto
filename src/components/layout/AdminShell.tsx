"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Gavel,
  AlertTriangle,
  BarChart3,
  Bell,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const items = [
  { href: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/admins", label: "Équipe admin", icon: Crown },
  { href: "/admin/kyc-queue", label: "File KYC", icon: ShieldCheck },
  { href: "/admin/auctions-queue", label: "Enchères à modérer", icon: Gavel },
  {
    href: "/admin/ownership-review",
    label: "Vérif. propriété",
    icon: ShieldCheck,
  },
  { href: "/admin/reports", label: "Signalements", icon: AlertTriangle },
  { href: "/admin/fraud", label: "Signaux fraude", icon: ShieldAlert },
  { href: "/admin/messages", label: "Modération msg", icon: MessageSquare },
  { href: "/admin/contact-inbox", label: "Boîte contact", icon: Inbox },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt },
  { href: "/admin/payouts", label: "Virements", icon: Banknote },
  { href: "/admin/forfeits", label: "Cautions retenues", icon: Ban },
  { href: "/admin/analytics", label: "Analyses", icon: BarChart3 },
  { href: "/admin/insights", label: "Insights", icon: TrendingUp },
  { href: "/admin/activity", label: "Activité", icon: Activity },
  { href: "/admin/broadcasts", label: "Annonces", icon: Megaphone },
  { href: "/admin/cms", label: "Contenu", icon: FileText },
  { href: "/admin/system", label: "Système", icon: Wrench },
  { href: "/admin/settings", label: "Paramètres", icon: Settings },
  { href: "/admin/me", label: "Mon profil admin", icon: UserCog },
];

interface Props {
  children: React.ReactNode;
}

export function AdminShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const t = useTranslations("nav");
  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar (desktop) / Top horizontal bar (mobile) */}
      <aside className="md:w-60 md:border-l border-[var(--border)] md:bg-[var(--surface)] md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Mazed" className="h-full w-full object-cover" />
            </div>
            <div className="font-bold gradient-gold-text">Admin</div>
          </Link>
          <button
            className="h-9 w-9 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center md:hidden"
            aria-label={t("notifications")}
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile horizontal nav */}
        <nav className="md:hidden border-b border-[var(--border)] overflow-x-auto hide-scrollbar">
          <div className="flex gap-1 p-2 min-w-max">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-[var(--radius)] text-xs font-semibold whitespace-nowrap shrink-0",
                    active
                      ? "bg-[var(--gold)] text-black"
                      : "text-[var(--foreground-muted)] hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Desktop vertical nav */}
        <nav className="hidden md:flex flex-col gap-1 p-3">
          {items.map((item) => {
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
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <div className="mt-auto pt-4 border-t border-[var(--border)]">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 h-10 w-full rounded-[var(--radius)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  );
}
