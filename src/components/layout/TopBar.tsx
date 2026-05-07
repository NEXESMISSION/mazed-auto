"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import {
  Bell,
  Menu,
  User,
  LogOut,
  LayoutDashboard,
  Settings,
  Heart,
  Gavel,
  X,
  Home,
  Search,
  HelpCircle,
  FileText,
  Plus,
  ChevronRight,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useRealtimeNotifications } from "@/lib/realtime";
import { BackButton } from "./BackButton";

export function TopBar() {
  const { user, loaded, signOut } = useAuth();
  const { unread } = useRealtimeNotifications(user?.id);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("auctions") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/help", label: t("help") },
  ];
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function handleSignOut() {
    await signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0a0a0a] border-b border-[var(--border)]">
      <div className="max-w-[var(--max-w)] mx-auto h-full px-4 md:px-6 flex items-center gap-3">
        {/* Back affordance — hidden on the home route */}
        <BackButton />

        {/* Mobile hamburger — opens drawer with Mazed Auto branding */}
        <button
          onClick={() => setDrawer(true)}
          className="md:hidden h-9 w-9 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors"
          aria-label={tCommon("menu")}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Wordmark — desktop only, links home */}
        <Link
          href="/"
          className="hidden md:inline font-bold tracking-tight text-base gradient-gold-text"
          aria-label="Mazed Auto"
        >
          Mazed Auto
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 me-auto ms-6">
          {NAV.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "relative h-10 px-3 flex items-center text-sm font-semibold transition-colors",
                  active
                    ? "text-[var(--gold)]"
                    : "text-[var(--foreground-muted)] hover:text-foreground",
                )}
              >
                {n.label}
                {active && (
                  <span className="absolute bottom-0 inset-x-3 h-[2px] bg-[var(--gold)] rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-1 ms-auto md:ms-0">
          {user && (
            <>
              <Link
                href="/messages"
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors"
                aria-label="Messages"
              >
                <MessageSquare className="h-[18px] w-[18px]" />
              </Link>
              <Link
                href="/notifications"
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors relative"
                aria-label="Notifications"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread !== null && unread > 0 && (
                  <span className="absolute top-0.5 left-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </>
          )}

          {!loaded ? (
            <div className="h-9 w-9 rounded-full bg-[var(--surface)] animate-pulse" />
          ) : user ? (
            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center text-[var(--gold)] font-bold text-sm transition-all",
                  open
                    ? "bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]"
                    : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)]/40",
                )}
                aria-label="Compte"
                aria-expanded={open}
              >
                {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
              </button>

              {open && (
                <div className="absolute end-0 mt-2 w-64 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-2xl overflow-hidden">
                  <div className="p-4">
                    <div className="font-bold text-sm">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] truncate mt-0.5">
                      {user.email}
                    </div>
                    {user.kycStatus === "verified" && (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--gold-faint)] text-[10px] font-bold text-[var(--gold)] uppercase tracking-wider">
                        <ShieldCheck className="h-3 w-3" />
                        {tAuth("verified")}
                      </div>
                    )}
                  </div>
                  <nav className="border-t border-[var(--border)] py-1">
                    <DropItem
                      href={
                        user.role === "admin"
                          ? "/admin/dashboard"
                          : user.role === "seller"
                            ? "/seller/dashboard"
                            : "/buyer/dashboard"
                      }
                      icon={<LayoutDashboard className="h-4 w-4" />}
                      onClick={() => setOpen(false)}
                    >
                      {t("dashboard")}
                    </DropItem>
                    <DropItem
                      href="/buyer/watchlist"
                      icon={<Heart className="h-4 w-4" />}
                      onClick={() => setOpen(false)}
                    >
                      {t("watchlist")}
                    </DropItem>
                    <DropItem
                      href="/buyer/bids"
                      icon={<Gavel className="h-4 w-4" />}
                      onClick={() => setOpen(false)}
                    >
                      {t("myBids")}
                    </DropItem>
                    <DropItem
                      href="/settings"
                      icon={<Settings className="h-4 w-4" />}
                      onClick={() => setOpen(false)}
                    >
                      {t("settings")}
                    </DropItem>
                  </nav>
                  <div className="border-t border-[var(--border)]">
                    <button
                      onClick={handleSignOut}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      {tAuth("signOut")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="h-9 px-4 ms-1 flex items-center gap-1.5 rounded-full gradient-gold text-black font-bold text-sm shadow-[var(--shadow-gold)] hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{tAuth("signIn")}</span>
            </Link>
          )}
        </div>
      </div>

      {drawer && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setDrawer(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 right-0 h-full w-[90vw] max-w-[380px] bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a] to-[#0d0a05] border-l border-[var(--border)] shadow-[-20px_0_60px_rgba(0,0,0,0.8)] flex flex-col animate-slide-in-right"
          >
            {/* Header strip — close button on the leading edge, wordmark trailing */}
            <div className="h-[var(--topbar-h)] flex items-center justify-between px-4 border-b border-[var(--border)]/50">
              <button
                onClick={() => setDrawer(false)}
                className="h-9 w-9 rounded-full hover:bg-[var(--surface)] flex items-center justify-center transition-colors"
                aria-label={tCommon("close")}
              >
                <X className="h-5 w-5" />
              </button>
              <div className="text-[10px] uppercase tracking-[0.3em] font-bold gradient-gold-text">
                Mazed · Auto
              </div>
            </div>

            {/* Hero — full-bleed user card or branded guest hero */}
            {user ? (
              <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]/50">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[var(--gold)] to-[var(--gold-bright)] flex items-center justify-center text-black font-extrabold text-xl shadow-[var(--shadow-gold)]">
                      {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </div>
                    {user.kycStatus === "verified" && (
                      <span
                        className="absolute -bottom-0.5 -end-0.5 h-5 w-5 rounded-full bg-[var(--gold)] border-2 border-[#0a0a0a] flex items-center justify-center"
                        title={tAuth("verified")}
                      >
                        <ShieldCheck className="h-3 w-3 text-black" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base truncate">
                      {[user.firstName, user.lastName]
                        .filter(Boolean)
                        .join(" ") || user.email?.split("@")[0]}
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] truncate">
                      {user.email}
                    </div>
                  </div>
                </div>

                {/* Verification row + profile shortcut */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  {user.kycStatus === "verified" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">
                      <ShieldCheck className="h-3 w-3" />
                      {tAuth("verifiedAccount")}
                    </span>
                  ) : (
                    <Link
                      href="/kyc/start"
                      onClick={() => setDrawer(false)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-bold hover:bg-amber-500/25 transition-colors"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {tAuth("completeVerification")}
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    onClick={() => setDrawer(false)}
                    className="text-[11px] text-[var(--gold)] font-bold inline-flex items-center gap-0.5 hover:underline"
                  >
                    {tAuth("viewProfile")}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {/* Sell-car shortcut — high-intent CTA */}
                <Link
                  href="/seller/new/step-1"
                  onClick={() => setDrawer(false)}
                  className="mt-4 h-11 w-full rounded-[var(--radius)] gradient-gold text-black font-bold text-sm shadow-[var(--shadow-gold)] flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                  <Plus className="h-4 w-4" />
                  {t("sellCar")}
                </Link>
              </div>
            ) : (
              <div className="px-5 pt-6 pb-5 border-b border-[var(--border)]/50 text-center space-y-3">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-[var(--gold)] to-[var(--gold-bright)] flex items-center justify-center text-black font-extrabold text-2xl shadow-[var(--shadow-gold)]">
                  M
                </div>
                <div>
                  <div className="font-extrabold text-base">
                    <span className="gradient-gold-text">{tAuth("intelligentAuctions")}</span>
                  </div>
                  <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                    {tAuth("loginPrompt")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={() => setDrawer(false)}
                    className="h-10 rounded-[var(--radius)] gradient-gold text-black font-bold text-sm flex items-center justify-center gap-1.5 shadow-[var(--shadow-gold)]"
                  >
                    <User className="h-4 w-4" />
                    {tAuth("signIn")}
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setDrawer(false)}
                    className="h-10 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold flex items-center justify-center"
                  >
                    {tAuth("signUp")}
                  </Link>
                </div>
              </div>
            )}

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <DrawerSection>
                <DrawerLink
                  href="/"
                  icon={<Home className="h-4 w-4" />}
                  active={pathname === "/"}
                  onClick={() => setDrawer(false)}
                >
                  {t("home")}
                </DrawerLink>
                <DrawerLink
                  href="/auctions"
                  icon={<Search className="h-4 w-4" />}
                  active={pathname.startsWith("/auctions")}
                  onClick={() => setDrawer(false)}
                >
                  {t("browse")}
                </DrawerLink>
              </DrawerSection>

              {user && (
                <DrawerSection label={t("myAccount")}>
                  <DrawerLink
                    href={
                      user.role === "admin"
                        ? "/admin/dashboard"
                        : user.role === "seller"
                          ? "/seller/dashboard"
                          : "/buyer/dashboard"
                    }
                    icon={<LayoutDashboard className="h-4 w-4" />}
                    active={
                      pathname === "/admin/dashboard" ||
                      pathname === "/seller/dashboard" ||
                      pathname === "/buyer/dashboard"
                    }
                    onClick={() => setDrawer(false)}
                  >
                    {t("dashboard")}
                  </DrawerLink>
                  <DrawerLink
                    href="/buyer/bids"
                    icon={<Gavel className="h-4 w-4" />}
                    active={pathname === "/buyer/bids"}
                    onClick={() => setDrawer(false)}
                  >
                    {t("myBids")}
                  </DrawerLink>
                  <DrawerLink
                    href="/buyer/watchlist"
                    icon={<Heart className="h-4 w-4" />}
                    active={pathname === "/buyer/watchlist"}
                    onClick={() => setDrawer(false)}
                  >
                    {t("watchlist")}
                  </DrawerLink>
                  <DrawerLink
                    href="/messages"
                    icon={<MessageSquare className="h-4 w-4" />}
                    active={pathname.startsWith("/messages")}
                    onClick={() => setDrawer(false)}
                  >
                    {t("messages")}
                  </DrawerLink>
                  <DrawerLink
                    href="/notifications"
                    icon={<Bell className="h-4 w-4" />}
                    active={pathname === "/notifications"}
                    onClick={() => setDrawer(false)}
                    badge={
                      unread !== null && unread > 0
                        ? unread > 99
                          ? "99+"
                          : String(unread)
                        : undefined
                    }
                  >
                    {t("notifications")}
                  </DrawerLink>
                  <DrawerLink
                    href="/settings"
                    icon={<Settings className="h-4 w-4" />}
                    active={pathname === "/settings"}
                    onClick={() => setDrawer(false)}
                  >
                    {t("settings")}
                  </DrawerLink>
                </DrawerSection>
              )}

              <DrawerSection label={t("info")}>
                <DrawerLink
                  href="/how-it-works"
                  icon={<HelpCircle className="h-4 w-4" />}
                  active={pathname === "/how-it-works"}
                  onClick={() => setDrawer(false)}
                >
                  {t("howItWorks")}
                </DrawerLink>
                <DrawerLink
                  href="/help"
                  icon={<HelpCircle className="h-4 w-4" />}
                  active={pathname === "/help"}
                  onClick={() => setDrawer(false)}
                >
                  {t("help")}
                </DrawerLink>
                <DrawerLink
                  href="/terms"
                  icon={<FileText className="h-4 w-4" />}
                  active={pathname === "/terms"}
                  onClick={() => setDrawer(false)}
                >
                  {t("terms")}
                </DrawerLink>
              </DrawerSection>
            </nav>

            {user && (
              <div className="border-t border-[var(--border)]/50 p-3">
                <button
                  onClick={() => {
                    setDrawer(false);
                    handleSignOut();
                  }}
                  className="w-full px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 rounded-[var(--radius)] transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  {tAuth("signOut")}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </header>
  );
}

function DrawerSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2">
      {label && (
        <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-subtle)]">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function DrawerLink({
  href,
  icon,
  children,
  onClick,
  active,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative px-3 py-2.5 flex items-center gap-3 rounded-[var(--radius)] transition-all",
        active
          ? "bg-gradient-to-l from-[var(--gold-faint)] to-transparent text-[var(--gold)]"
          : "text-foreground hover:bg-[var(--surface)]",
      )}
    >
      {/* Active accent bar on the trailing edge (right in RTL = leading visually) */}
      {active && (
        <span className="absolute end-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-[var(--gold)]" />
      )}
      <span
        className={cn(
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-colors",
          active
            ? "bg-[var(--gold-faint)] text-[var(--gold)]"
            : "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
        )}
      >
        {icon}
      </span>
      <span className="font-semibold text-sm flex-1">{children}</span>
      {badge && (
        <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold flex items-center justify-center tabular-nums">
          {badge}
        </span>
      )}
      {!badge && active && (
        <ChevronRight className="h-3.5 w-3.5 text-[var(--gold)]/60" />
      )}
    </Link>
  );
}

function DropItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-[var(--surface-2)] transition-colors"
    >
      <span className="text-[var(--foreground-muted)]">{icon}</span>
      <span className="font-semibold">{children}</span>
    </Link>
  );
}
