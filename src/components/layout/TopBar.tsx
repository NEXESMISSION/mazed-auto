"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Bell, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useRealtimeNotifications } from "@/lib/realtime";
import { BackButton } from "./BackButton";

/**
 * Slim top bar.
 *
 * The previous version had a mobile burger drawer + an avatar dropdown +
 * a "Connexion" CTA pill. All three were redundant once the bottom tab
 * bar shipped — Account/Profile, Watchlist, MyBids, Browse and the Sell
 * FAB are all reachable from the bottom — so we removed them.
 *
 * Layout rules (from the user's spec):
 *   - Back button is always on the leading edge when present.
 *   - Messages + Notifications icons swap sides depending on what's on
 *     the leading edge: if back-button (or, in the future, a search bar)
 *     occupies the start, the icons move to the trailing edge; if the
 *     start is empty the icons sit at the start themselves.
 *
 * Brand wordmark + desktop nav links live in the middle.
 */
export function TopBar() {
  const { user } = useAuth();
  const { unread } = useRealtimeNotifications(user?.id);
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");

  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("auctions") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/help", label: t("help") },
  ];

  // Both `/` and `/auctions` are home; BackButton already returns null on
  // those paths (see BackButton.tsx) but we mirror the same condition
  // here to decide which side the message + notification icons sit on.
  const isHome = pathname === "/" || pathname === "/auctions";
  const hasBackButton = !isHome;
  const iconsOnEnd = hasBackButton; // back at start → icons at end

  function Icons() {
    if (!user) return null;
    return (
      <>
        <Link
          href="/messages"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors"
          aria-label={t("messages")}
        >
          <MessageSquare className="h-5 w-5" />
        </Link>
        <Link
          href="/notifications"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors relative"
          aria-label={t("notifications")}
        >
          <Bell className="h-5 w-5" />
          {unread !== null && unread > 0 && (
            <span className="absolute top-1 end-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </>
    );
  }

  return (
    <header className="sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0a0a0a] border-b border-[var(--border)]">
      <div className="max-w-[var(--max-w)] mx-auto h-full px-4 md:px-6 flex items-center gap-2">
        {/* Leading cluster */}
        {hasBackButton && <BackButton />}
        {!iconsOnEnd && (
          <div className="flex items-center gap-1">
            <Icons />
          </div>
        )}

        {/* Brand wordmark — visible on both mobile and desktop now that
            the burger is gone, gives the bar identity. */}
        <Link
          href="/"
          className="font-bold tracking-tight text-base gradient-gold-text ms-1"
          aria-label={tBrand("name")}
        >
          {tBrand("name")}
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1 ms-6">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
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

        {/* Spacer that pushes the trailing cluster to the end */}
        <div className="flex-1" />

        {/* Trailing cluster */}
        {iconsOnEnd && (
          <div className="flex items-center gap-1">
            <Icons />
          </div>
        )}
      </div>
    </header>
  );
}
