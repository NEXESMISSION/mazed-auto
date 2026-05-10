"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LogIn } from "lucide-react";
import { HeaderIcons } from "./HeaderIcons";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Global desktop header — hidden on mobile (lg+ only). Rendered once
 * in AppShell so every page on lg+ shares the same chrome regardless
 * of whether the page also has its own mobile header.
 *
 * Trimmed layout (no search pill, no secondary links, no profile-name
 * link):
 *   [logo] [Browse · Sell · My bids] ······ [bell] [avatar / Connexion]
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

  // Three primary destinations only. "My account" is the avatar pill on
  // the right; "How it works" / "Help" live in the footer / direct URLs.
  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("browseShort") },
    { href: "/seller/new/step-1", label: t("sellCar") },
    { href: "/buyer/bids", label: t("myBids") },
  ];

  return (
    <header className="hidden lg:block sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-[var(--border)] shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
      <div className="h-16 max-w-[var(--max-w-wide)] mx-auto px-8 flex items-center gap-6">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 shrink-0"
          aria-label={tBrand("name")}
        >
          <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
          <div className="font-extrabold tracking-tight text-lg gradient-gold-text">
            {tBrand("name")}
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0.5 ms-4">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "h-9 px-3.5 flex items-center text-sm font-semibold rounded-full transition-colors",
                  active
                    ? "text-[var(--gold)] bg-[var(--gold-faint)]"
                    : "text-[var(--foreground-muted)] hover:text-foreground hover:bg-[var(--surface)]",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Auth cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <HeaderIcons hideWhenSignedOut={false} ghost />
          {loaded && user ? (
            <Link
              href="/profile"
              className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-[var(--border)] hover:ring-[var(--gold)] transition-colors"
              aria-label="Profil"
            >
              <Avatar size="sm" alt={user.firstName || user.email || ""} />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--gold)] text-black font-bold text-sm hover:scale-[1.02] active:scale-[0.99] transition-transform"
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
