"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LogIn, Search } from "lucide-react";
import { HeaderIcons } from "./HeaderIcons";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Global desktop header — hidden on mobile (lg+ only). Rendered once
 * in AppShell so every page on lg+ shares the same chrome regardless
 * of whether the page also has its own mobile header.
 *
 * Layout:
 *   [logo + brand] [nav links centered] [search] [auth cluster]
 *
 * Mobile chrome is left untouched — the existing TopBar / HomeHeader
 * / BrowseHeader / ScreenHeader are gated lg:hidden and continue to
 * own the mobile experience.
 */
export function DesktopHeader() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");
  const { user, loaded } = useAuth();

  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("browseShort") },
    { href: "/seller/new/step-1", label: t("sellCar") },
    { href: "/buyer/bids", label: t("myBids") },
    { href: "/profile", label: t("myAccount") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/help", label: t("help") },
  ];

  return (
    <header className="hidden lg:block sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-[var(--border)] shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
      <div className="h-20 max-w-[var(--max-w-wide)] mx-auto px-8 flex items-center gap-6">
        {/* Brand: logo + wordmark */}
        <Link
          href="/"
          className="flex items-center gap-3 shrink-0"
          aria-label={tBrand("name")}
        >
          <div className="h-11 w-11 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60 shadow-[var(--shadow-gold)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
          <div className="font-extrabold tracking-tight text-xl gradient-gold-text">
            {tBrand("name")}
          </div>
        </Link>

        {/* Nav — first 4 are primary destinations, last 2 (How it works / Help)
            are secondary and slightly muted. */}
        <nav className="flex items-center gap-0.5 flex-1 ms-2">
          {NAV.map((n, i) => {
            const active =
              n.href === "/"
                ? pathname === "/"
                : pathname.startsWith(n.href);
            const isSecondary = i >= 4;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "relative h-10 px-4 flex items-center text-[15px] font-semibold rounded-full transition-colors",
                  active
                    ? "text-[var(--gold)] bg-[var(--gold-faint)]"
                    : isSecondary
                      ? "text-[var(--foreground-subtle)] hover:text-foreground"
                      : "text-[var(--foreground-muted)] hover:text-foreground hover:bg-[var(--surface)]",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Search jump — clicking pushes to /auctions which has the real
            filter UI. Cheaper than building a global search modal here. */}
        <Link
          href="/auctions"
          className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:border-[var(--gold-soft)] hover:text-foreground transition-colors min-w-[200px]"
          aria-label="Rechercher"
        >
          <Search className="h-4 w-4" />
          <span>Rechercher une voiture…</span>
        </Link>

        {/* Auth cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <HeaderIcons hideWhenSignedOut={false} ghost />
          {loaded && user ? (
            <Link
              href="/profile"
              className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold)] transition-colors overflow-hidden"
              aria-label="Profil"
            >
              <Avatar size="sm" alt={user.firstName || user.email || ""} />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--gold)] text-black font-bold text-sm hover:scale-[1.02] active:scale-[0.99] transition-transform shadow-[var(--shadow-gold)]"
            >
              <LogIn className="h-4 w-4" />
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
