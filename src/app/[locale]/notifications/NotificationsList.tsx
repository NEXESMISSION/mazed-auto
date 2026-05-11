"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
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
  Clock,
  Star,
  ShieldAlert,
  CheckCircle2,
  CreditCard,
  RefreshCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRealtimeNotifications } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NotificationKind, NotificationRow } from "@/lib/db";

interface KindEntry {
  icon: LucideIcon;
  color: string;
  href?: (n: NotificationRow) => string;
}

const kindMeta: Record<NotificationKind, KindEntry> = {
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
  // v2 expansion ---------------------------------------------------------
  kyc_approved: {
    icon: ShieldCheck,
    color: "text-emerald-400 bg-emerald-500/15",
    href: () => "/kyc/status",
  },
  kyc_rejected: {
    icon: ShieldAlert,
    color: "text-red-400 bg-red-500/15",
    href: () => "/kyc/status",
  },
  kyc_expires_soon: {
    icon: Clock,
    color: "text-amber-400 bg-amber-500/15",
    href: () => "/kyc/status",
  },
  auction_starting_soon: {
    icon: Clock,
    color: "text-[var(--gold)] bg-[var(--gold-faint)]",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids"),
  },
  reserve_not_met: {
    icon: AlertTriangle,
    color: "text-amber-400 bg-amber-500/15",
    href: () => "/seller/auctions",
  },
  auction_extended: {
    icon: Clock,
    color: "text-amber-400 bg-amber-500/15",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids"),
  },
  deposit_refunded: {
    icon: RefreshCcw,
    color: "text-emerald-400 bg-emerald-500/15",
    href: () => "/transactions",
  },
  deposit_forfeited: {
    icon: AlertTriangle,
    color: "text-red-400 bg-red-500/15",
    href: () => "/transactions",
  },
  payment_received: {
    icon: CreditCard,
    color: "text-emerald-400 bg-emerald-500/15",
    href: () => "/transactions",
  },
  rating_request: {
    icon: Star,
    color: "text-[var(--gold)] bg-[var(--gold-faint)]",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids"),
  },
  new_report: {
    icon: ShieldAlert,
    color: "text-red-400 bg-red-500/15",
    href: () => "/seller/auctions",
  },
  account_blocked: {
    icon: ShieldAlert,
    color: "text-red-400 bg-red-500/15",
    href: () => "/profile",
  },
};

const FALLBACK_META: KindEntry = {
  icon: CheckCircle2,
  color: "text-[var(--gold)] bg-[var(--gold-faint)]",
};

interface Props {
  userId: string;
  initial: NotificationRow[];
}

const PAGE_SIZE = 50;

export function NotificationsList({ userId, initial }: Props) {
  const { items: liveItems } = useRealtimeNotifications(userId, initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [older, setOlder] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const locale = useLocale();

  // Merge realtime + older pages. Realtime is the source of truth for
  // the first page (it handles inserts/updates); the "older" array
  // only grows when the user clicks load-more. Dedup by id in case the
  // realtime stream overlaps with a pagination fetch.
  const allItems = (() => {
    if (older.length === 0) return liveItems;
    const seen = new Set(liveItems.map((n) => n.id));
    return [...liveItems, ...older.filter((n) => !seen.has(n.id))];
  })();
  const filtered =
    filter === "unread" ? allItems.filter((n) => !n.is_read) : allItems;
  const unreadCount = allItems.filter((n) => !n.is_read).length;

  async function loadMore() {
    if (loading || !hasMore || allItems.length === 0) return;
    setLoading(true);
    const supabase = createClient();
    // Cursor: anything older than the current oldest row's created_at.
    const oldest = allItems[allItems.length - 1];
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const rows = (data ?? []) as NotificationRow[];
    setOlder((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }

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
            {allItems.length}
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
            // Fallback so a new kind (added to the CHECK constraint but
            // not yet to `kindMeta`) renders cleanly instead of crashing
            // with "Cannot read property 'icon' of undefined".
            const meta = kindMeta[n.kind] ?? FALLBACK_META;
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
                      {formatRelative(n.created_at, locale)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {/* Load-more — only when the "all" filter is active. When
              filtering for unread, all loaded rows that are still
              unread are already visible; "older" rows on the server
              that are still unread can be fetched with the same
              loadMore() (cursor by created_at) so we surface it too. */}
          {hasMore && (
            <div className="pt-2 lg:pt-3 flex justify-center">
              <Button
                variant="secondary"
                size="md"
                onClick={loadMore}
                disabled={loading}
                className="min-w-[200px]"
              >
                {loading ? "…" : locale === "ar" ? "تحميل المزيد" : "Charger plus"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Locale-aware relative time. Uses Intl.RelativeTimeFormat so Arabic
 * users get "منذ 5 دقائق" instead of the hard-coded French. Picks the
 * largest unit (minute → hour → day) so the label stays compact.
 */
function formatRelative(iso: string, locale: string): string {
  const tag = locale === "ar" ? "ar-TN" : "fr-TN";
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diffMs / 60_000);
  // Within the first minute, fall back to a hand-rolled label so the
  // RelativeTimeFormat doesn't return "il y a 0 minute".
  if (min < 1) {
    return locale === "ar" ? "الآن" : "à l'instant";
  }
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const days = Math.floor(hr / 24);
  if (days < 30) return rtf.format(-days, "day");
  return new Date(iso).toLocaleDateString(tag);
}
