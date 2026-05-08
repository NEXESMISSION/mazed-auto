"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bell, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRealtimeNotifications } from "@/lib/realtime";

interface Props {
  /** Smaller (h-9 w-9) variant when sitting next to a profile avatar. */
  compact?: boolean;
  /** Hide entirely when the user is signed out instead of rendering empty. */
  hideWhenSignedOut?: boolean;
  /** Borderless hover-only variant — used inside the dark TopBar. */
  ghost?: boolean;
}

/**
 * Two-icon cluster (messages + notifications with unread badge) reused by
 * the home header, the browse header, and the global TopBar so the icon
 * appearance and unread count behaviour stay consistent everywhere.
 */
export function HeaderIcons({
  compact,
  hideWhenSignedOut = true,
  ghost,
}: Props) {
  const { user } = useAuth();
  const { unread } = useRealtimeNotifications(user?.id);
  const t = useTranslations("nav");

  if (!user && hideWhenSignedOut) return null;

  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const base = `${size} flex items-center justify-center rounded-full transition-colors`;
  const skin = ghost
    ? "hover:bg-[var(--surface)]"
    : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)]";

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/messages"
        className={`${base} ${skin}`}
        aria-label={t("messages")}
      >
        <MessageSquare className="h-[18px] w-[18px]" />
      </Link>
      <Link
        href="/notifications"
        className={`${base} ${skin} relative`}
        aria-label={t("notifications")}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread !== null && unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </div>
  );
}
