"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { HeaderIcons } from "./HeaderIcons";
import { cn } from "@/lib/utils";

interface Props {
  /** Page-specific eyebrow + title shown on the start side. */
  eyebrow?: string;
  title: string;
  /** Optional action slot shown between the title and HeaderIcons —
   *  e.g. the /auctions view-mode toggle. */
  action?: ReactNode;
}

/**
 * Lightweight top header for "noTopBar" pages (browse, etc.). Same
 * routing as TopBar / HomeHeader / BottomTabBar so users get
 * consistent nav across viewports.
 */
export function BrowseHeader({ eyebrow, title, action }: Props) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("browseShort") },
    { href: "/seller/new/step-1", label: t("sellCar") },
    { href: "/buyer/bids", label: t("myBids") },
    { href: "/profile", label: t("myAccount") },
  ];

  return (
    // Mobile-only — desktop chrome is owned by the global DesktopHeader.
    <header className="lg:hidden px-4 pt-6">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Accueil"
          className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </Link>
        <div className="flex-1 min-w-0 lg:flex-none">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] truncate">
              {eyebrow}
            </div>
          )}
          <div className="font-extrabold text-[18px] tracking-tight truncate leading-tight">
            {title}
          </div>
        </div>

        {/* Desktop nav — only renders on lg+. Same destinations as
            TopBar / HomeHeader / BottomTabBar. */}
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

        {action}
        <HeaderIcons />
      </div>
    </header>
  );
}
