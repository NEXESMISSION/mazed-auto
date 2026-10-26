"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useScrollLock } from "@/lib/scrollLock";
import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard, Inbox, Receipt, Tag, Users, FolderTree,
  SlidersHorizontal, ExternalLink, Menu, X, Store, ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { NavIcon } from "./kit/LinkPending";
import { LocaleChoice } from "@/components/i18n/LocaleSwitch";
import { LOGO } from "@/lib/brand";

/**
 * Console navigation.
 *
 * The old sidebar carried 24 links in 5 groups. Measured against the live
 * database on 2026-09-04, eight of those pointed at tables holding zero rows
 * (properties, auctions, auction_deposits, seller_payouts, inspectors,
 * waitlist…), two more at screens that read the wrong table, and one at a
 * page deleted in Phase 6a. The grouping made it worse: "Enchères (v2)" was
 * an entire section of dead ends sitting directly under the one link that
 * matters.
 *
 * This is the whole console now — six destinations, no groups, plus Site for
 * the things you touch monthly. A link earns its place by having data behind
 * it and a decision to make about that data; anything else is a screen that
 * teaches you to distrust the menu.
 *
 * The retired routes are not deleted yet (Phase 8 does that, with redirects) —
 * they are simply no longer reachable from here.
 */

type Item = {
  /** Names the label and hint under `admin.shell.nav`. */
  key: string;
  href: string;
  Icon: LucideIcon;
  /** Key into the `counts` map — a badge for work that is waiting. */
  countKey?: "annonces" | "paiements" | "demandes" | "boutiques";
};

const NAV: Item[] = [
  { key: "dashboard", href: "/admin", Icon: LayoutDashboard },
  { key: "annonces", href: "/admin/annonces", Icon: Inbox, countKey: "annonces" },
  { key: "paiements", href: "/admin/paiements", Icon: Receipt, countKey: "paiements" },
  // What shops ask before they may pay (0196): openings, plans, boosts.
  { key: "demandes", href: "/admin/demandes", Icon: ClipboardCheck, countKey: "demandes" },
  { key: "offres", href: "/admin/offres", Icon: Tag },
  { key: "boutiques", href: "/admin/boutiques", Icon: Store, countKey: "boutiques" },
  { key: "vendeurs", href: "/admin/vendeurs", Icon: Users },
  { key: "catalogue", href: "/admin/catalogue", Icon: FolderTree },
];

const SITE: Item = { key: "site", href: "/admin/site", Icon: SlidersHorizontal };

export type AdminCounts = Partial<Record<"annonces" | "paiements" | "demandes" | "boutiques", number>>;

function BrandMark({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("admin.shell");
  return (
    <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5">
      <Image
        src={LOGO.mark.src}
        alt=""
        width={LOGO.mark.width}
        height={LOGO.mark.height}
        sizes="24px"
        className="h-6 w-auto shrink-0"
      />
      <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-foreground">
        Mazed<span className="text-[var(--gold)]"> {t("console")}</span>
      </span>
    </Link>
  );
}

function NavList({
  counts,
  onNavigate,
}: {
  counts: AdminCounts;
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin.shell.nav");
  const pathname = usePathname();

  // `/admin` must match exactly — every other route starts with it, so a
  // prefix test lights the dashboard up on every single screen.
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);

  const render = (item: Item) => {
    const active = isActive(item.href);
    const count = item.countKey ? counts[item.countKey] ?? 0 : 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href as "/admin"}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={t(`${item.key}.hint`)}
          className={`relative flex items-center gap-2.5 py-[7px] ps-4 pe-3 text-[13px] font-medium transition ${
            active
              ? "text-[var(--gold)] before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-[var(--gold)]"
              : "text-muted hover:text-foreground"
          }`}
        >
          {/* Swaps to a spinner while this destination loads — the item you
              clicked is the one that shows it is working. */}
          <NavIcon Icon={item.Icon} active={active} />
          <span className="truncate">{t(`${item.key}.label`)}</span>
          {count > 0 && (
            <span
              className={`batta-tabular ms-auto text-[11px] font-bold ${
                active ? "text-[var(--gold)]" : "text-[var(--tone-warn)]"
              }`}
            >
              {count}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto py-3">
      <ul>{NAV.map(render)}</ul>
      <ul className="mt-3 border-t border-border pt-3">{render(SITE)}</ul>
    </nav>
  );
}

function ExitLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("admin.shell");
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-4 py-[7px] text-[12.5px] font-medium text-subtle transition hover:text-foreground"
    >
      <ExternalLink className="size-4 shrink-0 rtl:-scale-x-100" strokeWidth={2} />
      {t("exit")}
    </Link>
  );
}

/**
 * The console's language: French or Arabic, the same switch as the site's.
 * No label beside it — the rail is 196px and the two names say what it is.
 */
function LanguageRow() {
  return (
    <div className="px-4 py-2">
      <LocaleChoice />
    </div>
  );
}

/** Sticky rail at the start edge — desktop only. */
export function AdminRail({ counts }: { counts: AdminCounts }) {
  return (
    <aside className="hidden h-dvh w-[196px] shrink-0 flex-col border-e border-border lg:flex">
      <header className="flex h-12 items-center border-b border-border px-4">
        <BrandMark />
      </header>
      <NavList counts={counts} />
      <footer className="border-t border-border py-2">
        <LanguageRow />
        <ExitLink />
      </footer>
    </aside>
  );
}

/** Top bar + slide-over drawer — below lg. */
export function AdminMobileBar({ counts }: { counts: AdminCounts }) {
  const t = useTranslations("admin.shell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer when the route changes. During render, not in an effect:
  // the new screen's first paint already has the drawer shut, instead of
  // showing it over the new page for a frame.
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useScrollLock(open);

  return (
    <div className="lg:hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <BrandMark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("openMenu")}
          aria-expanded={open}
          className="tap-target grid size-9 place-items-center rounded text-muted transition hover:text-foreground"
        >
          <Menu className="size-5" strokeWidth={2.2} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("navLabel")}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 flex w-[240px] max-w-[85vw] flex-col border-e border-border bg-background animate-fade-in">
            <header className="flex h-12 items-center justify-between border-b border-border px-4">
              <BrandMark onNavigate={() => setOpen(false)} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("closeMenu")}
                className="tap-target grid size-8 place-items-center rounded text-muted transition hover:text-foreground"
              >
                <X className="size-5" strokeWidth={2.2} />
              </button>
            </header>
            <NavList counts={counts} onNavigate={() => setOpen(false)} />
            <footer className="border-t border-border py-2">
              <LanguageRow />
              <ExitLink onNavigate={() => setOpen(false)} />
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
