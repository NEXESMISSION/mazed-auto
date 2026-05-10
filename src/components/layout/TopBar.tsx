"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { BackButton } from "./BackButton";
import { HeaderIcons } from "./HeaderIcons";

/**
 * Top app bar.
 *
 * - Trailing cluster (Messages + Notifications) is always at the end so
 *   users learn one position for every screen.
 * - The bar uses the safe-area inset on top so notch / status-bar
 *   pixels don't overlap the brand and back button on mobile.
 * - Slightly taller (64px content + safe area) and a subtle bottom
 *   shadow so the bar separates from the page content cleanly even on
 *   pages that don't have their own header.
 */
export function TopBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");

  // Desktop nav mirrors the mobile BottomTabBar destinations so users
  // get the same routing on both viewports. The brand wordmark (link
  // to /) plus these four covers all five mobile tabs.
  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("browseShort") },
    { href: "/seller/new/step-1", label: t("sellCar") },
    { href: "/buyer/bids", label: t("myBids") },
    { href: "/profile", label: t("myAccount") },
  ];

  // Both `/` and `/auctions` are home; BackButton returns null on those
  // paths but the rule is the same here — show it everywhere else.
  const isHome = pathname === "/" || pathname === "/auctions";
  const hasBackButton = !isHome;

  return (
    <header
      className={cn(
        // Mobile-only — desktop is owned by the global DesktopHeader.
        "lg:hidden",
        "sticky top-0 z-40 bg-[#0a0a0a] border-b border-[var(--border)]",
        "shadow-[0_2px_18px_rgba(0,0,0,0.35)]",
        // Total bar = topbar-h + safe-area-inset-top (notch). Padding
        // pushes the row content down past the notch.
        "h-[calc(var(--topbar-h)+env(safe-area-inset-top))]",
        "pt-[env(safe-area-inset-top)]",
      )}
    >
      <div className="max-w-[var(--max-w)] mx-auto h-full px-4 md:px-6 flex items-center gap-2">
        {/* Leading cluster */}
        {hasBackButton && <BackButton />}

        {/* Brand wordmark — gold gradient. Slightly larger and with
            more breathing room so it reads like an app title. */}
        <Link
          href="/"
          className="font-extrabold tracking-tight text-[17px] gradient-gold-text ms-1.5"
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

        {/* Trailing cluster — always on the right */}
        <HeaderIcons ghost />
      </div>
    </header>
  );
}
