"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, Search, Plus, LayoutGrid, User } from "lucide-react";

/**
 * Bottom tab bar — full-width, flush-bottom, frosted dark surface.
 *
 *   - Frosted dark background that lets the page peek through subtly,
 *     anchored to the bottom edge. A single hairline top border keeps
 *     it crisp without competing with content.
 *   - Five cells. Cell 3 is the metallic gold "Sell" FAB — a saturated
 *     disc that lifts above the bar's top edge so it pops as the action.
 *   - Active tab: gold icon + label + v1's glowing gold pin hanging from
 *     the bar's top edge. Inactive: muted. Hover lightly brightens.
 *   - Safe-area aware: the visible icon row is `--bottombar-h` tall;
 *     the bar background extends below it for the iPhone home indicator.
 */

type Tab = {
  href: "/" | "/annonces" | "/annonces/nouvelle" | "/account/listings" | "/account";
  labelKey: "home" | "browse" | "sell" | "activity" | "account";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (p: string) => boolean;
  /** Renders the floating navy FAB instead of a regular cell. */
  isCenter?: boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    labelKey: "home",
    Icon: Home,
    match: (p) => p === "/",
  },
  {
    // The catalog. /properties and /auctions are v2 surfaces that no longer
    // have an entry point anywhere in the app (PIVOT-PLAN.md Phase 6 deletes
    // them); they stay in `match` only so a stale bookmark still lights the
    // right tab while the last lots finish.
    href: "/annonces",
    labelKey: "browse",
    Icon: Search,
    match: (p) =>
      p === "/annonces" ||
      p.startsWith("/annonces/") ||
      p === "/properties" ||
      p.startsWith("/properties/") ||
      p.startsWith("/auctions"),
  },
  {
    href: "/annonces/nouvelle",
    labelKey: "sell",
    Icon: Plus,
    match: (p) => p.startsWith("/annonces/nouvelle") || p === "/sell" || p.startsWith("/sell/"),
    isCenter: true,
  },
  {
    href: "/account/listings",
    labelKey: "activity",
    Icon: LayoutGrid,
    match: (p) =>
      p === "/account/activity" ||
      p === "/watchlist" ||
      p.startsWith("/watchlist/"),
  },
  {
    href: "/account",
    labelKey: "account",
    Icon: User,
    match: (p) =>
      p === "/account" ||
      (p.startsWith("/account/") && p !== "/account/activity") ||
      p === "/login" ||
      p === "/signup" ||
      p.startsWith("/kyc") ||
      p.startsWith("/payment") ||
      p.startsWith("/partners") ||
      p.startsWith("/admin"),
  },
];

export function BottomTabBar() {
  const t = useTranslations("shell.tabs");
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-border bg-surface/80 backdrop-blur-xl shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.06)] lg:hidden"
      style={{
        height: "calc(var(--batta-bottombar-h) + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.Icon;
        const active = tab.match(pathname);

        if (tab.isCenter) {
          // Gold-gradient FAB — same metallic 135° sweep as the splash,
          // brand mark, and notification modal header. White ring keeps
          // it floating above the bar's hairline border.
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex h-full items-center justify-center"
              aria-label={t(tab.labelKey)}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`relative inline-flex h-14 w-14 -translate-y-5 items-center justify-center rounded-full bg-gradient-to-b from-[#f7e07a] via-[var(--gold-bright)] to-[var(--gold-soft)] text-black shadow-[var(--shadow-gold),inset_0_1px_0_0_rgba(255,255,255,0.35),inset_0_-1px_0_0_rgba(0,0,0,0.15)] ring-4 ring-[var(--background)] transition-transform active:scale-95 ${
                  active ? "scale-105" : "hover:scale-[1.03]"
                }`}
              >
                <Plus className="h-6 w-6" strokeWidth={2.5} />
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 transition-colors ${
              active
                ? "text-[var(--gold)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
            aria-label={t(tab.labelKey)}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={`h-6 w-6 transition-transform ${active ? "scale-110" : ""}`}
              strokeWidth={active ? 2.5 : 2}
            />
            <span className="max-w-full truncate text-[10px] font-semibold leading-tight">
              {t(tab.labelKey)}
            </span>
            {/* Active indicator — v1's glowing gold pin hanging from the
                bar's top edge. */}
            {active && (
              <span className="absolute top-0 h-1 w-10 rounded-b-full bg-[var(--gold)] shadow-[0_0_12px_var(--gold-glow)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
