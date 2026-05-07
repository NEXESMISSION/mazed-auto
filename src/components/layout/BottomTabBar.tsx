"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Home, Search, Plus, Gavel, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomTabBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  const tabs = [
    { href: "/", label: t("home"), icon: Home, match: (p: string) => p === "/" },
    {
      href: "/auctions",
      label: t("browseShort"),
      icon: Search,
      match: (p: string) => p.startsWith("/auctions"),
    },
    {
      href: "/seller/new/step-1",
      label: t("sellCar"),
      icon: Plus,
      match: (p: string) => p.startsWith("/seller/new"),
      isCenter: true,
    },
    {
      href: "/buyer/bids",
      label: t("myBids"),
      icon: Gavel,
      match: (p: string) => p.startsWith("/buyer"),
    },
    {
      href: "/profile",
      label: t("myAccount"),
      icon: User,
      match: (p: string) => p.startsWith("/profile") || p.startsWith("/settings"),
    },
  ] as const;

  return (
    <nav
      className={cn(
        "md:hidden sticky bottom-0 z-40 h-[var(--bottombar-h)] pb-safe",
        "bg-[#0e0e0e] border-t border-[var(--border-strong)]",
        "shadow-[0_-8px_24px_rgba(0,0,0,0.5)]",
        "grid grid-cols-5 items-center px-1",
      )}
      aria-label={tCommon("primaryNav")}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(pathname);

        if ("isCenter" in tab && tab.isCenter) {
          // Floating circular gold button — icon only, no label. The whole
          // center cell is the tap target so it stays accessible.
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex items-center justify-center h-full"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "relative h-12 w-12 -translate-y-3 rounded-full",
                  "bg-gradient-to-b from-[#f7e07a] via-[var(--gold-bright)] to-[var(--gold-soft)]",
                  "shadow-[var(--shadow-gold),inset_0_1px_0_0_rgba(255,255,255,0.35),inset_0_-1px_0_0_rgba(0,0,0,0.15)]",
                  "flex items-center justify-center transition-transform active:scale-95",
                  active ? "scale-105" : "hover:scale-[1.03]",
                )}
              >
                <Plus className="h-5 w-5 text-black" strokeWidth={3} />
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 h-full transition-colors",
              active
                ? "text-[var(--gold)]"
                : "text-[var(--foreground-muted)] hover:text-foreground",
            )}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
          >
            {active && (
              <span className="absolute top-0 h-1 w-8 rounded-b-full bg-[var(--gold)] shadow-[0_0_12px_var(--gold-glow)]" />
            )}
            <Icon
              className={cn(
                "h-5 w-5 transition-transform",
                active && "scale-110",
              )}
              strokeWidth={active ? 2.5 : 2}
            />
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
