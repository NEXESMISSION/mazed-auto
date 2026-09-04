"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard, Inbox, Receipt, Tag, Users, FolderTree,
  SlidersHorizontal, ExternalLink, Menu, X, Car,
  type LucideIcon,
} from "lucide-react";

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
  label: string;
  href: string;
  Icon: LucideIcon;
  hint: string;
  /** Key into the `counts` map — a badge for work that is waiting. */
  countKey?: "annonces" | "paiements";
};

const NAV: Item[] = [
  {
    label: "Tableau de bord",
    href: "/admin",
    Icon: LayoutDashboard,
    hint: "Ce qui attend une décision",
  },
  {
    label: "Annonces",
    href: "/admin/annonces",
    Icon: Inbox,
    hint: "Modérer, créer, mettre en avant",
    countKey: "annonces",
  },
  {
    label: "Paiements",
    href: "/admin/payments",
    Icon: Receipt,
    hint: "Reçus à valider",
    countKey: "paiements",
  },
  {
    label: "Offres & prix",
    href: "/admin/pricing",
    Icon: Tag,
    hint: "Annonces, packs, mises en avant, badge",
  },
  {
    label: "Vendeurs",
    href: "/admin/users",
    Icon: Users,
    hint: "Comptes, rôles, badges",
  },
  {
    label: "Catalogue",
    href: "/admin/characteristics",
    Icon: FolderTree,
    hint: "Catégories et caractéristiques",
  },
];

const SITE: Item = {
  label: "Site",
  href: "/admin/site",
  Icon: SlidersHorizontal,
  hint: "Accueil, popups, documents, diffusions, réglages, journal",
};

export type AdminCounts = Partial<Record<"annonces" | "paiements", number>>;

function BrandMark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5">
      <span className="batta-gradient-gold grid size-9 place-items-center rounded-xl text-black shadow-[var(--shadow-gold)]">
        <Car className="size-4" strokeWidth={2.2} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted">
          Mazed Auto
        </span>
        <span className="gradient-gold-text text-[15px] font-extrabold">Console</span>
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
          title={item.hint}
          className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition ${
            active
              ? "bg-[var(--gold)] text-black"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <item.Icon
            className={`size-4 shrink-0 ${active ? "text-black" : "text-muted"}`}
            strokeWidth={2}
          />
          <span className="truncate">{item.label}</span>
          {count > 0 && (
            <span
              className={`batta-tabular ms-auto rounded px-1.5 py-0.5 text-[10.5px] font-extrabold ${
                active
                  ? "bg-black/15 text-black"
                  : "bg-[rgba(245,158,11,0.14)] text-[#e0a029]"
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
    <nav className="flex-1 overflow-y-auto px-3 py-5">
      <ul className="space-y-0.5">{NAV.map(render)}</ul>
      <ul className="mt-6 space-y-0.5 border-t border-border pt-5">{render(SITE)}</ul>
    </nav>
  );
}

function ExitLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-muted transition hover:bg-surface-2 hover:text-foreground"
    >
      <ExternalLink className="size-4 shrink-0" strokeWidth={2} />
      Quitter l&apos;admin
    </Link>
  );
}

/** Sticky rail — desktop only. */
export function AdminRail({ counts }: { counts: AdminCounts }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-e border-border bg-surface lg:flex">
      <header className="flex items-center border-b border-border px-5 py-5">
        <BrandMark />
      </header>
      <NavList counts={counts} />
      <footer className="border-t border-border px-3 py-3">
        <ExitLink />
      </footer>
    </aside>
  );
}

/** Top bar + slide-over drawer — below lg. */
export function AdminMobileBar({ counts }: { counts: AdminCounts }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur-md">
        <BrandMark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          className="tap-target grid size-10 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <Menu className="size-5" strokeWidth={2.2} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation admin">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 flex w-[272px] max-w-[85vw] flex-col border-e border-border bg-surface shadow-[var(--shadow-lg)] animate-fade-in">
            <header className="flex items-center justify-between border-b border-border px-4 py-4">
              <BrandMark onNavigate={() => setOpen(false)} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="tap-target grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-5" strokeWidth={2.2} />
              </button>
            </header>
            <NavList counts={counts} onNavigate={() => setOpen(false)} />
            <footer className="border-t border-border px-3 py-3">
              <ExitLink onNavigate={() => setOpen(false)} />
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
