"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { HeaderIcons } from "@/components/layout/HeaderIcons";
import { cn } from "@/lib/utils";

interface Props {
  signedIn: boolean;
}

/**
 * Home header — logo + brand on the start, desktop nav links in the
 * middle (lg+ only), messages + notifications cluster on the end.
 * Mirrors TopBar's desktop nav so the user gets the same routing
 * regardless of which page they're on.
 */
export function HomeHeader({ signedIn: _signedIn }: Props) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Same destinations as TopBar / BottomTabBar.
  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("browseShort") },
    { href: "/seller/new/step-1", label: t("sellCar") },
    { href: "/buyer/bids", label: t("myBids") },
    { href: "/profile", label: t("myAccount") },
  ];

  return (
    // Mobile-only — desktop chrome is owned by the global DesktopHeader.
    <section className="lg:hidden px-4 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="h-11 w-11 shrink-0 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60 shadow-[var(--shadow-gold)]"
          aria-label="Mazed Auto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Mazed Auto"
            className="h-full w-full object-cover"
            draggable={false}
          />
        </Link>
        <div className="flex-1 min-w-0 lg:flex-none">
          <div className="font-bold text-[15px] truncate leading-tight">
            Mazed Auto
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
            Enchères de confiance — Tunisie
          </div>
        </div>

        {/* Desktop nav — only renders on lg+. Mobile relies on the
            BottomTabBar for routing. */}
        <nav className="hidden lg:flex items-center gap-1 ms-6 flex-1">
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

        {/* hideWhenSignedOut={false} so guests see the icons too — taps
            on /messages / notifications redirect to login if needed. */}
        <HeaderIcons hideWhenSignedOut={false} />
      </div>
    </section>
  );
}
