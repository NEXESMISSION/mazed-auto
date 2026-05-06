"use client";

import { useRouter, usePathname } from "next/navigation";
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
  if (pathname === "/") return null;

  const parent = parentPath(pathname);

  return (
    <button
      onClick={() => router.push(parent)}
      aria-label="Retour"
      className="
        group relative h-10 w-10 rounded-full shrink-0
        bg-[var(--surface)] border border-[var(--border)]
        text-foreground
        flex items-center justify-center
        shadow-[var(--shadow-sm)]
        hover:bg-[var(--surface-2)] hover:border-[var(--gold-soft)]
        hover:shadow-[0_0_0_3px_var(--gold-faint),var(--shadow-sm)]
        active:scale-95
        transition-all duration-150
      "
    >
      <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-[1.5px]" />
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
