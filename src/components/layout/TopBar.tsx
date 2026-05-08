"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { BackButton } from "./BackButton";
import { HeaderIcons } from "./HeaderIcons";

/**
 * Slim top bar.
 *
 * Layout invariant: messages + notifications always sit on the trailing
 * edge (right in LTR), regardless of whether a back button is present on
 * the leading edge. This keeps the icon position predictable across every
 * page in the app.
 */
export function TopBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");

  const NAV: { href: string; label: string }[] = [
    { href: "/auctions", label: t("auctions") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/help", label: t("help") },
  ];

  // Both `/` and `/auctions` are home; BackButton returns null on those
  // paths but the rule is the same here — show it everywhere else.
  const isHome = pathname === "/" || pathname === "/auctions";
  const hasBackButton = !isHome;

  return (
    <header className="sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0a0a0a] border-b border-[var(--border)]">
      <div className="max-w-[var(--max-w)] mx-auto h-full px-4 md:px-6 flex items-center gap-2">
        {/* Leading cluster */}
        {hasBackButton && <BackButton />}

        {/* Brand wordmark */}
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

        {/* Trailing cluster — always on the right */}
        <HeaderIcons ghost />
      </div>
    </header>
  );
}
