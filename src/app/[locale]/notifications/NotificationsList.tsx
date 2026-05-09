"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Gavel,
  Trophy,
  TrendingDown,
  ShieldCheck,
  Wallet,
  AlertTriangle,
  Check,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRealtimeNotifications } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/lib/db";

const kindMeta: Record<
  NotificationRow["kind"],
  { icon: LucideIcon; color: string; href?: (n: NotificationRow) => string }
> = {
  outbid: {
    icon: TrendingDown,
    color: "text-amber-400 bg-amber-500/15",
    // Link to the detail page, not /bid directly. The auction may have ended
    // since the notification was sent — the detail page shows the right state
    // (live → bid CTA, ended → result banner) without a confusing redirect.
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids"),
  },
  won: {
    icon: Trophy,
    color: "text-[var(--gold)] bg-[var(--gold-faint)]",
    href: () => "/buyer/bids",
  },
  lost: {
    icon: AlertTriangle,
    color: "text-red-400 bg-red-500/15",
    href: () => "/buyer/bids",
  },
  new_bid: {
    icon: Gavel,
    color: "text-[var(--gold)] bg-[var(--gold-faint)]",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/seller/auctions"),
  },
  approved: {
    icon: Check,
    color: "text-emerald-400 bg-emerald-500/15",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/seller/auctions"),
  },
  rejected: {
    icon: AlertTriangle,
    color: "text-red-400 bg-red-500/15",
    href: () => "/seller/auctions",
  },
  payment_due: {
    icon: Wallet,
    color: "text-blue-400 bg-blue-500/15",
    href: () => "/buyer/bids",
  },
  reminder: { icon: Bell, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  system: { icon: ShieldCheck, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
};

interface Props {
  userId: string;
  initial: NotificationRow[];
}

export function NotificationsList({ userId, initial }: Props) {
  const { items } = useRealtimeNotifications(userId, initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filtered = filter === "unread" ? items.filter((n) => !n.is_read) : items;
  const unreadCount = items.filter((n) => !n.is_read).length;

  async function readAll() {
    if (unreadCount === 0) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Notifications</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={readAll}
          disabled={unreadCount === 0}
        >
          <Check className="h-4 w-4" />
          Tout marquer lu
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 h-9 rounded-full text-sm font-semibold transition-colors ${
            filter === "all"
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          Tous ({items.length})
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 h-9 rounded-full text-sm font-semibold transition-colors ${
            filter === "unread"
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          Non lus ({unreadCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Bell className="h-10 w-10 text-[var(--foreground-muted)] mx-auto" />
          <div className="text-[var(--foreground-muted)]">
            {filter === "unread"
              ? "Aucune notification non lue"
              : "Aucune notification"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const meta = kindMeta[n.kind];
            const Icon = meta.icon;
            const href = meta.href?.(n) ?? "/notifications";
            return (
              <Link
                key={n.id}
                href={href}
                onClick={() => !n.is_read && markRead(n.id)}
                className={cn(
                  "block rounded-[var(--radius)] border p-3 transition-colors hover:bg-[var(--surface-2)]",
                  n.is_read
                    ? "bg-[var(--surface)] border-[var(--border)]"
                    : "bg-[var(--gold-faint)]/30 border-[var(--gold-soft)]/30",
                )}
              >
                <div className="flex gap-3">
                  <div
                    className={cn(
                      "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                      meta.color,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm">{n.title}</div>
                      {!n.is_read && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-[var(--gold)]" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-sm text-[var(--foreground-muted)] mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <div className="text-[10px] text-[var(--foreground-subtle)] mt-1">
                      {formatRelative(n.created_at)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatRelative(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Il y a ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `Il y a ${days} ${days === 1 ? "jour" : "jours"}`;
  return new Date(iso).toLocaleDateString("fr-TN");
}
