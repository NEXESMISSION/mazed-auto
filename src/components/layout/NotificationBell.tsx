"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { HeaderPopover } from "./HeaderPopover";
import { NotificationsPopupList } from "./NotificationsPopupList";
import { useRealtimeNotifications } from "@/lib/realtime";

interface Props {
  userId: string;
  /** Visual variant — bordered pill (default) or hover-only ghost (TopBar). */
  ghost?: boolean;
  /** Smaller (h-9) variant when sitting next to a profile avatar. */
  compact?: boolean;
}

/**
 * Bell icon with an unread badge that opens a header-anchored popover
 * instead of routing. Lets users skim alerts without losing the page
 * they were filling in (browse filters, sign-up form, etc.).
 *
 * The /notifications page still exists as the canonical feed for direct
 * links from email/push — same data via NotificationsList over there.
 */
export function NotificationBell({ userId, ghost, compact }: Props) {
  const { unread } = useRealtimeNotifications(userId);
  const [open, setOpen] = useState(false);

  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const base = `${size} flex items-center justify-center rounded-full transition-colors relative`;
  const skin = ghost
    ? "hover:bg-[var(--surface)]"
    : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)]";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${base} ${skin}`}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread !== null && unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <HeaderPopover
        open={open}
        onClose={() => setOpen(false)}
        label="Notifications"
      >
        <NotificationsPopupList userId={userId} onSelect={() => setOpen(false)} />
      </HeaderPopover>
    </>
  );
}
