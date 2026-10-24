"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** `key` names the tab under `pro.tabs`. */
const TABS = [
  { href: "/pro/dashboard", key: "summary" },
  { href: "/pro/dashboard/annonces", key: "listings" },
  { href: "/pro/dashboard/statistiques", key: "stats" },
  { href: "/pro/dashboard/marketing", key: "marketing" },
  { href: "/pro/dashboard/abonnement", key: "subscription" },
  { href: "/pro/dashboard/boutique", key: "shop" },
] as const;

/** The dashboard's sections. The exact match keeps « Résumé » from lighting up everywhere. */
export function ProTabs({ marketing = false }: { marketing?: boolean }) {
  const t = useTranslations("pro.tabs");
  const pathname = usePathname();
  // Marketing appears once the Social Publisher is open (or to an admin previewing it).
  const tabs = TABS.filter((t) => marketing || t.href !== "/pro/dashboard/marketing");
  return (
    <nav className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0" aria-label={t("nav")}>
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const on = tab.href === "/pro/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href as never}
              aria-current={on ? "page" : undefined}
              className={[
                "tap-target rounded-xl border px-3.5 py-2 text-[13px] font-bold transition",
                on
                  ? "border-gold-soft bg-gold-faint text-gold"
                  : "border-border bg-surface text-muted hover:border-gold-soft hover:text-foreground",
              ].join(" ")}
            >
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
