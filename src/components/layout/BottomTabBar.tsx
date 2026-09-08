"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, Search, Plus, Heart, User } from "lucide-react";
import { activeTabFor, TAB_HREFS, type TabId } from "@/lib/nav/tabs";

/**
 * Bottom tab bar — full-width, flush-bottom, frosted dark surface.
 *
 *   - Frosted dark background that lets the page peek through subtly,
 *     anchored to the bottom edge. A single hairline top border keeps
 *     it crisp without competing with content.
 *   - Five cells. Cell 3 is the "Sell" FAB — the one saturated
 *     disc that lifts above the bar's top edge so it pops as the action.
 *   - Active tab: light icon + label + a pin hanging from
 *     the bar's top edge. Inactive: muted. Hover lightly brightens.
 *   - Safe-area aware: the visible icon row is `--bottombar-h` tall;
 *     the bar background extends below it for the iPhone home indicator.
 */

type Tab = {
  id: TabId;
  /** Key under `shell.tabs` — not always the tab id (Favoris reuses
   *  the existing `watchlist` string rather than duplicating it). */
  labelKey: "home" | "browse" | "sell" | "watchlist" | "account";
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Renders the floating "Sell" FAB instead of a regular cell. */
  isCenter?: boolean;
};

/**
 * Order on screen. Which tab is ACTIVE is decided by `activeTabFor` in
 * src/lib/nav/tabs.ts, next to the hrefs it matches — the two used to live
 * apart, and drifted: this tab linked to /account/listings while matching the
 * old /account/activity, so it never lit up.
 */
const TABS: Tab[] = [
  { id: "home", labelKey: "home", Icon: Home },
  { id: "browse", labelKey: "browse", Icon: Search },
  { id: "sell", labelKey: "sell", Icon: Plus, isCenter: true },
  { id: "favorites", labelKey: "watchlist", Icon: Heart },
  { id: "account", labelKey: "account", Icon: User },
];

export function BottomTabBar() {
  const t = useTranslations("shell.tabs");
  const pathname = usePathname();
  const activeId = activeTabFor(pathname);

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
        const active = tab.id === activeId;
        // Typed routes: these are literal paths from TAB_HREFS, not user input.
        const href = TAB_HREFS[tab.id] as never;

        if (tab.isCenter) {
          // Gold-gradient FAB — same metallic 135° sweep as the splash,
          // brand mark, and notification modal header. White ring keeps
          // it floating above the bar's hairline border.
          return (
            <Link
              key={tab.id}
              href={href}
              className="relative flex h-full items-center justify-center"
              aria-label={t(tab.labelKey)}
              aria-current={active ? "page" : undefined}
            >
              {/* Light, not gold. It was a gold gradient with a gold glow —
                  the single loudest object on the page, for an action most
                  visitors never take. See .batta-btn-luxe in globals.css. */}
              <span
                className={`relative inline-flex h-14 w-14 -translate-y-5 items-center justify-center rounded-full bg-foreground text-[var(--background)] shadow-[var(--shadow-lg)] ring-4 ring-[var(--background)] transition-transform active:scale-95 ${
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
            key={tab.id}
            href={href}
            className={`relative flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 transition-colors ${
              active
                ? "text-foreground"
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
            {/* Active indicator — a pin hanging from the
                bar's top edge. */}
            {active && (
              <span className="absolute top-0 h-1 w-10 rounded-b-full bg-foreground" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
