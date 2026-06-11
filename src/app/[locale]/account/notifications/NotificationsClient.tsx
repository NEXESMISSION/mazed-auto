"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Ban,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  Gavel,
  HandCoins,
  Hourglass,
  Inbox,
  Loader2,
  Megaphone,
  Radio,
  Receipt,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Tag,
  Timer,
  TimerReset,
  TrendingUp,
  Trophy,
  UserCheck,
  Wallet,
  Wrench,
} from "lucide-react";
import { resolveNotificationLink } from "@/lib/notifications/target";

/** Same row shape the bell + /api/notifications use. */
export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export const PAGE_SIZE = 20;

// Re-render relative timestamps every 30s so "il y a 1 min" doesn't freeze.
const TICK_MS = 30_000;

/**
 * Kinds that get the red "URGENT" pill — narrow window to act before the
 * user loses money / a vehicle / a verification. Mirrors the header bell.
 */
const URGENT_KINDS = new Set<string>([
  "outbid",
  "sixth_offer_outbid",
  "auction_ending_soon",
  "auction_cancelled",
  "final_payment_due_soon",
  "final_payment_due_tomorrow",
  "final_payment_overdue",
  "final_payment_overdue_seller",
  "kyc_rejected",
  "listing_rejected",
  "listing_payment_rejected",
  "payment_rejected",
  "payout_rejected",
]);

export function NotificationsClient({
  initial,
  initialUnread,
  initialHasMore,
}: {
  initial: NotificationItem[];
  initialUnread: number;
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, setTick] = useState(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Mark everything read — optimistic; the API (PATCH { all: true }) scopes
  // to the caller via RLS. Best-effort like the bell: a network failure
  // leaves the server state behind, healed on next load.
  async function markAllRead() {
    if (unread === 0) return;
    setUnread(0);
    setItems((arr) =>
      arr.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // best-effort
    }
  }

  // Mark one row read when the user taps it (just before navigation).
  async function markOneRead(id: string) {
    const row = items.find((n) => n.id === id);
    if (!row || row.read_at) return;
    setItems((arr) =>
      arr.map((n) =>
        n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
      ),
    );
    setUnread((n) => Math.max(0, n - 1));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // best-effort
    }
  }

  // Next page via the existing route; dedup by id in case new rows landed
  // since the server render shifted the offsets.
  async function loadMore() {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NotificationItem[];
        hasMore?: boolean;
      };
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...data.items.filter((n) => !seen.has(n.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      // ignore — the user can tap again to retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;

  // Day buckets — items arrive sorted desc, so labels are monotonic and
  // consecutive grouping is enough.
  const groups: { label: string; rows: NotificationItem[] }[] = [];
  for (const n of visible) {
    const label = groupLabel(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(n);
    else groups.push({ label, rows: [n] });
  }

  return (
    <>
      {/* Toolbar — filter pills + mark-all-read. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Toutes", items.length],
            ["unread", "Non lues", unread],
          ] as const
        ).map(([key, label, count]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-colors ${
                active
                  ? "batta-gold-fill shadow-[var(--shadow-gold)]"
                  : "bg-surface text-muted ring-1 ring-border hover:text-foreground hover:ring-gold-soft/60"
              }`}
            >
              {label}
              <span
                className={`batta-tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none ${
                  active ? "bg-black/20" : "bg-surface-2 text-subtle"
                }`}
              >
                {count > 99 ? "99+" : count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unread === 0}
          className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-bold text-gold transition hover:bg-gold-faint disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
        >
          <CheckCheck className="size-4" strokeWidth={2.2} />
          Tout marquer lu
        </button>
      </div>

      {visible.length === 0 ? (
        // Only reachable on the "Non lues" filter (the page handles the
        // fully-empty inbox server-side).
        <div className="mt-6 rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-border">
          <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Check className="size-5 text-emerald-400" strokeWidth={2.2} />
          </span>
          <p className="mt-3 text-[13.5px] font-bold text-foreground">
            Aucune notification non lue
          </p>
          <p className="mt-1 text-[12px] text-muted">Vous êtes à jour.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <p className="batta-eyebrow batta-eyebrow-muted mb-2.5">{g.label}</p>
              <div className="space-y-2">
                {g.rows.map((n) => (
                  <NotificationRowCard
                    key={n.id}
                    item={n}
                    onRead={() => void markOneRead(n.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {filter === "all" && hasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="batta-btn-ghost-gold tap-target inline-flex min-w-[200px] items-center justify-center gap-2 px-5 py-2.5 text-[12.5px] disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  "Charger plus"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * One notification card. The whole card deep-links through
 * resolveNotificationLink (the single source of truth shared with the
 * header bell); kinds without a destination render as a non-navigating
 * row that still marks itself read on tap.
 */
function NotificationRowCard({
  item,
  onRead,
}: {
  item: NotificationItem;
  onRead: () => void;
}) {
  const isUnread = !item.read_at;
  const { Icon, tone } = iconForKind(item.kind);
  const isUrgent = isUnread && URGENT_KINDS.has(item.kind);
  const href = resolveNotificationLink(item.kind, item.link, item.payload);

  const rowCls = `block w-full rounded-2xl p-3.5 text-start ring-1 transition-colors hover:bg-surface-2 ${
    isUnread ? "bg-gold-faint/40 ring-gold-soft/40" : "bg-surface ring-border"
  }`;

  const inner = (
    <div className="flex gap-3">
      <span
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${tone} ${
          isUnread ? "" : "opacity-60"
        }`}
      >
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`text-[13.5px] leading-tight ${
              isUnread ? "font-extrabold text-foreground" : "font-semibold text-muted"
            }`}
          >
            {item.title}
            {isUrgent && (
              <span className="ms-2 inline-block translate-y-[-1px] rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-wider text-white">
                Urgent
              </span>
            )}
          </span>
          {isUnread && (
            <span
              aria-hidden
              className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-gold"
            />
          )}
        </div>
        {item.body && (
          <p
            className={`mt-1 line-clamp-2 text-[12.5px] leading-snug ${
              isUnread ? "text-foreground/80" : "text-muted"
            }`}
          >
            {item.body}
          </p>
        )}
        <p className="batta-tabular mt-1.5 text-[11px] text-subtle">
          {timeAgo(item.created_at)}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href as never} onClick={onRead} className={rowCls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onRead} className={`${rowCls} cursor-default`}>
      {inner}
    </button>
  );
}

/** Per-kind glyph + dark-theme tone (gold default), mirroring the bell. */
function iconForKind(kind: string): { Icon: typeof Bell; tone: string } {
  const emerald = "bg-emerald-500/15 text-emerald-400";
  const red = "bg-red-500/15 text-red-400";
  const amber = "bg-amber-500/15 text-amber-400";
  const sky = "bg-sky-500/15 text-sky-400";
  const gold = "bg-gold-faint text-gold";

  switch (kind) {
    case "kyc_verified":
      return { Icon: ShieldCheck, tone: emerald };
    case "kyc_rejected":
      return { Icon: ShieldX, tone: red };
    case "kyc_pending_reminder":
      return { Icon: Hourglass, tone: amber };
    case "payment_accepted":
      return { Icon: CheckCircle2, tone: emerald };
    case "payment_rejected":
      return { Icon: AlertTriangle, tone: red };
    case "payment_receipt_received":
      return { Icon: Receipt, tone: sky };
    case "deposit_refunded":
      return { Icon: RefreshCcw, tone: emerald };
    case "bid_placed":
    case "sixth_offer_placed":
    case "seller_received_bid":
      return { Icon: Gavel, tone: sky };
    case "outbid":
    case "sixth_offer_outbid":
      return { Icon: TrendingUp, tone: amber };
    case "seller_sixth_offer_received":
      return { Icon: TrendingUp, tone: sky };
    case "watched_new_bid":
      return { Icon: Eye, tone: sky };
    case "auction_won":
    case "sixth_offer_awarded":
      return { Icon: Trophy, tone: emerald };
    case "auction_sold_seller":
    case "auction_finalized_seller":
      return { Icon: HandCoins, tone: emerald };
    case "auction_ended_unsold":
    case "reserve_not_met":
      return { Icon: AlertTriangle, tone: amber };
    case "auction_ending_soon":
      return { Icon: Hourglass, tone: amber };
    case "auction_cancelled":
      return { Icon: Ban, tone: red };
    case "auction_live":
    case "auction_live_seller":
      return { Icon: Radio, tone: emerald };
    case "buy_now_initiated":
      return { Icon: HandCoins, tone: sky };
    case "listing_submitted":
      return { Icon: ClipboardList, tone: sky };
    case "listing_published":
    case "listing_approved":
      return { Icon: Sparkles, tone: emerald };
    case "listing_rejected":
    case "listing_payment_rejected":
      return { Icon: AlertTriangle, tone: red };
    case "listing_expired":
      return { Icon: Clock3, tone: amber };
    case "listing_unscheduled_reminder":
      return { Icon: CalendarClock, tone: amber };
    case "final_payment_due_soon":
      return { Icon: Timer, tone: amber };
    case "final_payment_due_tomorrow":
      return { Icon: TimerReset, tone: amber };
    case "final_payment_overdue":
    case "final_payment_overdue_seller":
      return { Icon: CircleAlert, tone: red };
    case "inspection_requested":
    case "inspector_application_received":
      return { Icon: FileText, tone: sky };
    case "inspection_assigned":
      return { Icon: UserCheck, tone: sky };
    case "inspection_scheduled":
      return { Icon: CalendarClock, tone: sky };
    case "inspection_completed":
      return { Icon: FileCheck2, tone: emerald };
    case "inspector_approved":
      return { Icon: ShieldCheck, tone: emerald };
    case "payout_processing":
      return { Icon: Wallet, tone: sky };
    case "payout_paid":
      return { Icon: Wallet, tone: emerald };
    case "payout_rejected":
      return { Icon: AlertTriangle, tone: red };
    case "welcome":
      return { Icon: Megaphone, tone: gold };
    case "announcement":
      return { Icon: Megaphone, tone: sky };
    case "promo":
      return { Icon: Tag, tone: emerald };
    case "maintenance":
      return { Icon: Wrench, tone: amber };
    case "system_alert":
      return { Icon: ShieldAlert, tone: red };
    case "admin_kyc_pending":
    case "admin_receipt_pending":
    case "admin_payout_pending":
    case "admin_listing_pending":
    case "admin_inspector_pending":
    case "admin_final_payment_overdue":
      return { Icon: Inbox, tone: gold };
    default:
      return { Icon: Bell, tone: gold };
  }
}

/** Bucket label for the day-group headers. */
function groupLabel(iso: string): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || t >= startOfToday) return "Aujourd'hui";
  if (t >= startOfToday - 86_400_000) return "Hier";
  if (t >= startOfToday - 6 * 86_400_000) return "Cette semaine";
  return "Plus ancien";
}

/** Compact French relative time — same scale as the header bell. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
