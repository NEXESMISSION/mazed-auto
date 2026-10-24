"use client";

import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/pro/dashboard", label: "Résumé" },
  { href: "/pro/dashboard/annonces", label: "Annonces" },
  { href: "/pro/dashboard/statistiques", label: "Statistiques" },
  { href: "/pro/dashboard/marketing", label: "Marketing" },
  { href: "/pro/dashboard/abonnement", label: "Abonnement" },
  { href: "/pro/dashboard/boutique", label: "Ma boutique" },
] as const;

/** The dashboard's sections. The exact match keeps « Résumé » from lighting up everywhere. */
export function ProTabs({ marketing = false }: { marketing?: boolean }) {
  const pathname = usePathname();
  // Marketing appears once the Social Publisher is open (or to an admin previewing it).
  const tabs = TABS.filter((t) => marketing || t.href !== "/pro/dashboard/marketing");
  return (
    <nav className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0" aria-label="Espace pro">
      <div className="flex min-w-max gap-2">
        {tabs.map((t) => {
          const on = t.href === "/pro/dashboard" ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href as never}
              aria-current={on ? "page" : undefined}
              className={[
                "tap-target rounded-xl border px-3.5 py-2 text-[13px] font-bold transition",
                on
                  ? "border-gold-soft bg-gold-faint text-gold"
                  : "border-border bg-surface text-muted hover:border-gold-soft hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
