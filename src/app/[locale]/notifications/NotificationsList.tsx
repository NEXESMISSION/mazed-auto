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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl lg:text-4xl xl:text-5xl font-extrabold lg:font-black lg:tracking-tight">
          Notifications
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={readAll}
          disabled={unreadCount === 0}
          className="lg:h-11 lg:px-4 lg:text-sm"
        >
          <Check className="h-4 w-4" />
          Tout marquer lu
        </Button>
      </div>

      <div className="flex gap-2 lg:gap-2.5">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 lg:px-5 h-9 lg:h-10 rounded-full text-sm font-semibold lg:font-bold transition-colors ${
            filter === "all"
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)]"
          }`}
        >
          Tous{" "}
          <span
            className={`ms-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] tabular-nums font-extrabold ${
              filter === "all"
                ? "bg-black/15 text-black"
                : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
            }`}
          >
            {items.length}
          </span>
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 lg:px-5 h-9 lg:h-10 rounded-full text-sm font-semibold lg:font-bold transition-colors ${
            filter === "unread"
              ? "bg-[var(--gold)] text-black"
              : "bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)]"
          }`}
        >
          Non lus{" "}
          <span
            className={`ms-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] tabular-nums font-extrabold ${
              filter === "unread"
                ? "bg-black/15 text-black"
                : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
            }`}
          >
            {unreadCount}
          </span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 lg:py-24 space-y-2">
          <Bell className="h-10 w-10 lg:h-14 lg:w-14 text-[var(--foreground-muted)] mx-auto" />
          <div className="text-[var(--foreground-muted)] lg:text-base font-bold lg:font-extrabold">
            {filter === "unread"
              ? "Aucune notification non lue"
              : "Aucune notification"}
          </div>
        </div>
      ) : (
        <div className="space-y-2 lg:space-y-2.5">
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
                  "block rounded-[var(--radius)] lg:rounded-2xl border p-3 lg:p-4 transition-colors hover:bg-[var(--surface-2)]",
                  n.is_read
                    ? "bg-[var(--surface)] border-[var(--border)]"
                    : "bg-[var(--gold-faint)]/30 border-[var(--gold-soft)]/30",
                )}
              >
                <div className="flex gap-3 lg:gap-4">
                  <div
                    className={cn(
                      "shrink-0 h-10 w-10 lg:h-12 lg:w-12 rounded-full flex items-center justify-center",
                      meta.color,
                    )}
                  >
                    <Icon className="h-5 w-5 lg:h-5.5 lg:w-5.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold lg:font-extrabold text-sm lg:text-base">
                        {n.title}
                      </div>
                      {!n.is_read && (
                        <span className="shrink-0 h-2 w-2 lg:h-2.5 lg:w-2.5 rounded-full bg-[var(--gold)] mt-2" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-sm lg:text-[14px] text-[var(--foreground-muted)] mt-0.5 lg:mt-1 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    )}
                    <div className="text-[10px] lg:text-[11px] text-[var(--foreground-subtle)] mt-1 lg:mt-1.5 tabular-nums">
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
