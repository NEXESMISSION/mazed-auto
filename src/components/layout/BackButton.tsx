"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveBack, readStack, writeStack } from "@/lib/navStack";

// Root tabs — the universal back button hides on these because there's
// nowhere logical to go back to from a top-level surface. Mirrors the
// ROOT_TAB_PATHS set in TopBar.
const ROOT_PATHS = new Set([
  "/",
  "/properties",
  "/account/activity",
  "/account",
]);

/**
 * Universal back affordance for the TopBar.
 *
 * - Hidden on the home / root-tab routes (already top-level).
 * - Returns to the page you actually came from, using the per-tab stack in
 *   `@/lib/navStack` rather than `router.back()`. Replaying real browser
 *   history walks back into gate routes that immediately redirect forward
 *   again (the /login ↔ /account ping-pong); the stack lets us skip those and
 *   push a destination the user can actually stand on. See navStack.ts for
 *   the full reasoning.
 * - Falls back to an explicit hierarchical parent, then home, when there is
 *   no usable history (deep link, fresh tab).
 * - Chevron flips for RTL so it always points in the page-flow direction.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const locale = useLocale();
  const isRTL = locale === "ar";
  const ChevronIcon = isRTL ? ChevronRight : ChevronLeft;

  if (ROOT_PATHS.has(pathname)) return null;

  function goBack() {
    const { target, nextStack } = resolveBack(readStack(), pathname);
    // Persist the truncated stack BEFORE navigating, so the tracker sees the
    // target already at the head and doesn't re-append it.
    writeStack(nextStack);
    router.push(target as "/");
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t("shell.back")}
      className="
        group relative h-9 w-9 rounded-full shrink-0
        bg-[var(--surface)] border border-[var(--gold-soft)]
        text-[var(--gold)]
        flex items-center justify-center
        hover:bg-[var(--gold-faint)] hover:border-[var(--gold)]
        active:scale-95
        transition-all duration-150
      "
    >
      <ChevronIcon
        className={`h-4 w-4 transition-transform ${
          isRTL ? "group-hover:translate-x-[2px]" : "group-hover:-translate-x-[2px]"
        }`}
        strokeWidth={2.5}
      />
    </button>
  );
}
