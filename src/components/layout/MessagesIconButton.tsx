"use client";

import { useEffect, useId, useState } from "react";
import { Link } from "@/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { HeaderPopover } from "./HeaderPopover";
import { MessagesPopupList } from "./MessagesPopupList";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  /** Borderless hover-only variant — used inside the dark TopBar. */
  ghost?: boolean;
  /** Smaller (h-9) variant when sitting next to a profile avatar. */
  compact?: boolean;
}

/**
 * Messages icon — opens a header-anchored popover on desktop (lg+) with
 * the conversations list, mirroring NotificationBell. On mobile (<lg),
 * routes to /messages so the existing dedicated page UX is preserved.
 *
 * The /messages page is still the canonical inbox — direct links (push,
 * email) keep working unchanged.
 */
export function MessagesIconButton({ userId, ghost, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<number | null>(null);
  // Per-mount suffix so React Strict Mode's double-mount doesn't resolve
  // the second effect to the already-subscribed channel — calling `.on()`
  // after `.subscribe()` is forbidden by realtime, throws at runtime.
  const instanceId = useId();

  // Live unread count via realtime — keeps the badge accurate without
  // polling. We count messages addressed to me (sender != me) where
  // read_at IS NULL.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length === 0) {
        if (!cancelled) setUnread(0);
        return;
      }
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .neq("sender_id", userId)
        .is("read_at", null);
      if (!cancelled) setUnread(count ?? 0);
    }

    refresh();

    const channel = supabase
      .channel(`messages-unread:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId]);

  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const base = `${size} flex items-center justify-center rounded-full transition-colors relative`;
  const skin = ghost
    ? "hover:bg-[var(--surface)]"
    : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)]";

  const badge =
    unread !== null && unread > 0 ? (
      <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-bold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  return (
    <>
      {/* Desktop: toggles the popover */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`hidden lg:flex ${base} ${skin}`}
        aria-label="Messages"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MessageSquare className="h-[18px] w-[18px]" />
        {badge}
      </button>

      {/* Mobile: routes to the standalone page (existing UX) */}
      <Link
        href="/messages"
        className={`lg:hidden ${base} ${skin}`}
        aria-label="Messages"
      >
        <MessageSquare className="h-[18px] w-[18px]" />
        {badge}
      </Link>

      <HeaderPopover
        open={open}
        onClose={() => setOpen(false)}
        label="Messages"
      >
        <MessagesPopupList
          userId={userId}
          unread={unread}
          onSelect={() => setOpen(false)}
        />
      </HeaderPopover>
    </>
  );
}
