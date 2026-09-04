"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { activeTabFor, TAB_HREFS, type TabId } from "@/lib/nav/tabs";
import { AccountMenu } from "./AccountMenu";
import { normalizeSearchQuery } from "@/lib/search";
import { SearchIcon, SearchSweep, SearchStatus } from "@/components/ui/SearchBusy";

// Lazy-loaded — see TopBar for rationale (heavy icon set + realtime socket +
// mount fetch, none needed for first paint). Reserves the 36px slot.
const NotificationBell = dynamic(
  () =>
    import("@/components/notifications/NotificationBell").then(
      (m) => m.NotificationBell,
    ),
  { ssr: false, loading: () => <span className="inline-block h-9 w-9" /> },
);

/**
 * Desktop (lg+) horizontal navigation. Replaces the mobile TopBar +
 * BottomTabBar on wide viewports (both are `lg:hidden`). Self-hides
 * below lg via `hidden lg:flex`, so the mobile chrome is the single
 * source of navigation on phones/tablets and stays untouched.
 *
 * Balanced three-zone bar:
 *   - Left: logo (→ home) + primary links with a soft active pill.
 *   - Center: an always-visible search that lands on the unified
 *     /properties explore surface.
 *   - Right: notification bell, account, and a saturated "Vendre" CTA.
 *
 * Height is pinned to --desktop-nav-h; the shell's top padding switches
 * to the same value at lg (see .batta-shell-main in globals.css).
 */

// v1's DesktopHeader nav, adapted to v2's routes:
//   Parcourir → /properties · Vendre votre voiture → /sell ·
//   Mes enchères → /account/activity · Tarifs Pro → /pricing.
// The logo itself links home, so no "Accueil" item (same as v1).
const LINKS: {
  href: "/annonces" | "/annonces/nouvelle" | "/account/listings" | "/pricing";
  key: "browse" | "sellLong" | "myBids" | "pricing";
}[] = [
  { href: "/annonces", key: "browse" },
  { href: "/annonces/nouvelle", key: "sellLong" },
  { href: "/account/listings", key: "myBids" },
  { href: "/pricing", key: "pricing" },
];

/**
 * Shares the bottom bar's rule (src/lib/nav/tabs.ts) for every link that is
 * also a tab, so the two navs cannot disagree about where you are. The local
 * version had the same overlap the bar did: its `/annonces` branch matched
 * `/annonces/nouvelle`, lighting "Parcourir" and "Vendre" together.
 */
function isActive(pathname: string, href: string): boolean {
  const tab = (Object.keys(TAB_HREFS) as TabId[]).find((id) => TAB_HREFS[id] === href);
  if (tab) return activeTabFor(pathname) === tab;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const t = useTranslations("shell.tabs");
  const ts = useTranslations("search");
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  // Ends when the new page is on screen, not on a timer.
  const [searching, startSearch] = useTransition();

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeSearchQuery(q);
    // Straight to the catalogue. This used to push /properties — the
    // auction-era surface, which the auction gate 307s to /annonces while
    // dropping the query string. Every header search therefore landed on the
    // FULL, unfiltered catalogue: you typed "golf", pressed Enter, and got all
    // 66 annonces. (The redirect keeps the query now too, for old links.)
    startSearch(() => {
      router.push(
        (clean ? `/annonces?q=${encodeURIComponent(clean)}` : "/annonces") as `/annonces`,
      );
    });
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 hidden h-[var(--desktop-nav-h)] items-center border-b border-border bg-surface lg:flex">
      <div className="mx-auto flex h-full w-full max-w-[var(--max-w-wide)] items-center gap-6 px-8">
        {/* ── Left zone: brand + primary links ── */}
        <div className="flex shrink-0 items-center gap-7">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Mazed Auto"
          >
            {/* Round MA monogram avatar + gold wordmark — matches v1's
                desktop header (the square logo must NOT be stretched into a
                wide box, which distorted the monogram). */}
            <span className="size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--gold-soft)]/60">
              <Image
                src="/logo.webp"
                alt=""
                width={72}
                height={72}
                priority
                sizes="36px"
                className="h-full w-full object-cover"
              />
            </span>
            <span className="text-lg font-extrabold tracking-tight gradient-gold-text">
              Mazed Auto
            </span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Navigation principale">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                    active
                      ? "bg-gold-faint text-[var(--gold)]"
                      : "text-[var(--foreground-muted)] hover:bg-surface-2 hover:text-[var(--foreground)]"
                  }`}
                >
                  {t(l.key)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ── Center zone: real search — submits to the explore surface ── */}
        <form onSubmit={submitSearch} className="flex flex-1 justify-center" role="search">
          <div className="relative flex w-full max-w-md items-center overflow-hidden rounded-full">
            <SearchIcon
              active={searching}
              className="pointer-events-none absolute size-4 text-muted ltr:left-4 rtl:right-4"
            />
            <SearchSweep active={searching} />
            <SearchStatus active={searching} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ts("placeholder")}
              aria-label={ts("placeholder")}
              className={`h-11 w-full rounded-full border bg-surface-2 text-[13px] text-foreground placeholder:text-muted transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-gold-faint ltr:pl-11 ltr:pr-4 rtl:pl-4 rtl:pr-11 ${searching ? "border-gold-soft" : "border-border focus:border-gold-soft/70"}`}
            />
          </div>
        </form>

        {/* ── Right zone: notifications + account (v1 keeps the header
            quiet on the right — selling lives in the nav links). ── */}
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
