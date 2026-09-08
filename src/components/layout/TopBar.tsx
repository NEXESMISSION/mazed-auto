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
 *   - Brand wordmark on the root pages renders in `gradient-gold-text`
 *     (the same recipe auto uses for "Mazed Auto").
 *   - Inner pages get a back button + plain Jakarta page title, gold
 *     accents only on the active state.
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
  // `h-9` (36px) inside a 56px bar (`--batta-topbar-h`). It was `h-11`, which
  // left six pixels of air above and below a nearly 3:1 mark — the logo
  // stopped reading as a logo and started reading as the bar itself. Ten
  // pixels of clearance is what makes it sit in the bar rather than fill it.
  // The width auto-scales via `w-auto`. `priority` skips the lazy-load — this
  // is above-the-fold on every page that shows the bar — and the asset is also
  // `<link rel="preload">`-ed in the root layout, so by the time this paints
  // it's already in cache.
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={t("name")}>
      {/* The MA monogram, in a WIDE box.
          It used to be `/logo.webp` inside a round `size-9` with
          `object-cover` — a square crop of a mark that is nearly 3:1, so the
          speed lines and most of the A were simply cut off. The file is
          pre-trimmed (no transparent margin), which is why no padding is
          needed here to make it sit right. */}
      <Image
        src="/logo-mark.webp"
        alt=""
        width={842}
        height={285}
        priority
        sizes="120px"
        className="h-9 w-auto shrink-0"
      />
      <span className="sr-only">{t("name")}</span>
    </Link>
  );
}
