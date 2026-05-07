"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Universal back affordance, intended for the TopBar.
 *
 * - Hidden on the home route (`/`) — there is nowhere to go back to.
 * - Navigates to the *logical parent* of the current path, not the previous
 *   browser-history entry. This avoids the classic loop where a redirecting
 *   page (e.g. /auctions/[id]/bid → /auctions/[id]) bounces the user back
 *   and forth between two URLs forever.
 * - Chevron points left (LTR back direction).
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const tCommon = useTranslations("common");
  // Both `/` and `/auctions` are "home" — `/` 308-redirects to /auctions
  // and the bottom-tab landing is /auctions. A back arrow on either would
  // loop the user back to themselves.
  if (pathname === "/" || pathname === "/auctions") return null;

  const parent = parentPath(pathname);

  return (
    <button
      onClick={() => router.push(parent)}
      aria-label={tCommon("back")}
      className="
        group relative h-12 w-12 rounded-full shrink-0
        bg-[var(--surface)] border-2 border-[var(--gold-soft)]
        text-[var(--gold)]
        flex items-center justify-center
        shadow-[var(--shadow-md)]
        hover:bg-[var(--gold-faint)] hover:border-[var(--gold)]
        hover:shadow-[0_0_0_4px_var(--gold-faint),var(--shadow-md)]
        active:scale-95
        transition-all duration-150
      "
    >
      <ChevronLeft className="h-6 w-6 transition-transform group-hover:-translate-x-[2px]" strokeWidth={2.5} />
    </button>
  );
}

/**
 * Map a pathname to a sensible "go back" target. Specific overrides come
 * first; the generic rule strips the last URL segment.
 */
function parentPath(pathname: string): string {
  // 1. Hard-coded overrides for nested flows whose generic parent isn't
  //    the right destination.
  const overrides: Array<{ test: RegExp; to: string | ((m: RegExpMatchArray) => string) }> = [
    // /auctions/[id]/bid → detail page
    {
      test: /^\/auctions\/[^/]+\/bid$/,
      to: (m) => `/auctions/${m[0].split("/")[2]}`,
    },
    // /seller/auctions/[id] → seller list
    { test: /^\/seller\/auctions\/[^/]+$/, to: "/seller/auctions" },
    // /admin/users/[id] → users list
    { test: /^\/admin\/users\/[^/]+$/, to: "/admin/users" },
    // /messages/[id] → inbox
    { test: /^\/messages\/[^/]+$/, to: "/messages" },
    // /profile/[username] → home (no list page for public profiles)
    { test: /^\/profile\/[^/]+$/, to: "/" },
    // /seller/new/* → seller dashboard
    { test: /^\/seller\/new(\/.*)?$/, to: "/seller/dashboard" },
    // /payment/* → home (each step is mid-flow, parent is wherever they came from)
    { test: /^\/payment\/[^/]+$/, to: "/" },
    // /kyc/* → kyc start
    { test: /^\/kyc\/(?!start$)[^/]+$/, to: "/kyc/start" },
    { test: /^\/kyc\/start$/, to: "/profile" },
    // Auth-only pages
    { test: /^\/(login|register|forgot-password|reset-password|verify-email|verify-phone)$/, to: "/" },
    // Settings → profile
    { test: /^\/settings$/, to: "/profile" },
    // /buyer/* leaves under buyer dashboard
    { test: /^\/buyer\/[^/]+$/, to: "/buyer/dashboard" },
  ];

  for (const o of overrides) {
    const m = pathname.match(o.test);
    if (m) return typeof o.to === "function" ? o.to(m) : o.to;
  }

  // 2. Generic: strip last segment. /a/b/c → /a/b. /a → /.
  const idx = pathname.lastIndexOf("/");
  if (idx <= 0) return "/";
  return pathname.slice(0, idx) || "/";
}
