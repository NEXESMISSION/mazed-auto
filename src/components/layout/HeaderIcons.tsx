"use client";

import { useTranslations } from "next-intl";
import { Bell, MessageSquare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "./NotificationBell";
import { MessagesIconButton } from "./MessagesIconButton";

interface Props {
  /** Smaller (h-9 w-9) variant when sitting next to a profile avatar. */
  compact?: boolean;
  /** Hide entirely when the user is signed out instead of rendering empty. */
  hideWhenSignedOut?: boolean;
  /** Borderless hover-only variant — used inside the dark TopBar. */
  ghost?: boolean;
}

/**
 * Two-icon cluster (messages + notifications-with-popover) reused by the
 * home header, the browse header, and the global TopBar. Both icons open
 * a popover on desktop (lg+) instead of navigating, so the user keeps
 * whatever they were doing on the page underneath. On mobile, messages
 * still route to /messages (no popup) to preserve the existing UX.
 * Signed-out users see the same icons — tapping either one routes
 * through /login.
 */
export function HeaderIcons({ compact, hideWhenSignedOut = true, ghost }: Props) {
  const { user } = useAuth();
  const t = useTranslations("nav");

  if (!user && hideWhenSignedOut) return null;

  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const base = `${size} flex items-center justify-center rounded-full transition-colors relative`;
  const skin = ghost
    ? "hover:bg-[var(--surface)]"
    : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)]";

  return (
    <div className="flex items-center gap-1">
      {user ? (
        <MessagesIconButton userId={user.id} ghost={ghost} compact={compact} />
      ) : (
        <Link
          href="/login?redirect=/messages"
          className={`${base} ${skin}`}
          aria-label={t("messages")}
        >
          <MessageSquare className="h-[18px] w-[18px]" />
        </Link>
      )}
      {user ? (
        <NotificationBell userId={user.id} ghost={ghost} compact={compact} />
      ) : (
        // Guest variant — same icon, routes to login. Keeps the header
        // shape stable for both signed-in and signed-out states so
        // returning users see a familiar layout.
        <Link
          href="/login?redirect=/notifications"
          className={`${base} ${skin}`}
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
        </Link>
      )}
    </div>
  );
}
