"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { BackButton } from "./BackButton";
import { LocaleSwitcher } from "./LocaleSwitcher";

// Lazy-loaded: the bell pulls in ~40 lucide icons, opens a realtime socket,
// and fetches /api/notifications on mount — none of which is needed for first
// paint. Deferring it (ssr:false) keeps it out of the initial bundle so every
// page becomes interactive sooner. The placeholder reserves the 36px slot so
// the bar doesn't shift when the bell hydrates in.
const NotificationBell = dynamic(
  () =>
    import("@/components/notifications/NotificationBell").then(
      (m) => m.NotificationBell,
    ),
  { ssr: false, loading: () => <span className="inline-block h-9 w-9" /> },
);

const ROOT_TAB_PATHS = new Set(["/", "/annonces", "/account/listings", "/account"]);

// Map the first path segment to the i18n key under shell.pageTitles.
// Anything not in here falls back to the brand mark.
const TITLE_BY_SEGMENT: Record<string, string> = {
  properties: "properties",
  auctions: "auctions",
  inspectors: "inspectors",
  watchlist: "watchlist",
  account: "account",
  login: "login",
  signup: "signup",
  kyc: "kyc",
  partners: "partners",
  sell: "sell",
  admin: "admin",
  payment: "payment",
};

/**
 * Mobile-app top bar — ported from the mazed-auto pattern.
 *
 *   - Pure `#0a0a0a` background with a soft black drop, no glass
 *     or hairline gold rule. The chrome stays out of the way so the
 *     page content carries the design weight.
 *   - Root pages get the monogram plus the name in plain Jakarta. The name
 *     used to be `sr-only` and the mark used to be gold-gradient text; both
 *     are now the same weight as everything else in the bar.
 *   - Inner pages get a back button + page title instead.
 */
export function TopBar() {
  const t = useTranslations();
  const locale = useLocale();
  const isRTL = locale === "ar";
  const pathname = usePathname();

  const isRoot = ROOT_TAB_PATHS.has(pathname) || pathname === "/";
  const segment = pathname.split("/").filter(Boolean)[0];
  const titleKey = segment ? TITLE_BY_SEGMENT[segment] : undefined;

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 bg-surface border-b border-border pt-safe lg:hidden"
      style={{ height: "calc(var(--batta-topbar-h) + var(--batta-safe-top))" }}
    >
      <div className="mx-auto flex h-[var(--batta-topbar-h)] max-w-[var(--max-w-wide)] items-center gap-2 px-4">
        {/* LEADING — back on inner pages, brand on root.
            BackButton lives in its own component so the parent-path
            mapping (which avoids redirect loops on routes like
            /auctions/[id]/bid) is shared with any other surface that
            needs an in-app back affordance. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isRoot ? (
            <BrandMark />
          ) : (
            <>
              <BackButton />
              {titleKey && (
                <h1
                  className={`truncate text-[16px] font-bold tracking-tight text-foreground ${
                    isRTL ? "font-arabic" : ""
                  }`}
                >
                  {t(`shell.pageTitles.${titleKey}`)}
                </h1>
              )}
            </>
          )}
        </div>

        {/* TRAILING — notifications bell + locale switcher */}
        <div className="flex items-center gap-1">
          <NotificationBell />
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  const t = useTranslations("brand");
  // The logo's emblem and its own « MAZED AUTO » wordmark side by side, as
  // ONE image (`lockup-wide`, built by scripts/regen-logos.mjs), `h-8` (32px)
  // in a 56px bar (`--batta-topbar-h`): ~210px across.
  //
  // It was the emblem with the name typed beside it in the site font. The
  // metallic mark next to plain text read as two unrelated things, and at
  // 32px the emblem outweighed the 15px name. The logo's own wordmark is the
  // name, so nothing is typed here; the link's aria-label says it.
  //
  // The width auto-scales via `w-auto`. `priority` skips the lazy-load — this
  // is above-the-fold on every page that shows the bar.
  return (
    <Link href="/" className="flex items-center" aria-label={t("name")}>
      <Image
        src="/brand/lockup-wide.png"
        alt=""
        width={1573}
        height={240}
        priority
        sizes="210px"
        className="h-8 w-auto shrink-0"
      />
    </Link>
  );
}
