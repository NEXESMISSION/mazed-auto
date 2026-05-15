"use client";

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
import { useRealtimeNotifications } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NotificationKind, NotificationRow } from "@/lib/db";

interface KindEntry {
  icon: LucideIcon;
  color: string;
}

const kindMeta: Record<NotificationKind, KindEntry> = {
  outbid: { icon: TrendingDown, color: "text-amber-400 bg-amber-500/15" },
  won: { icon: Trophy, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  lost: { icon: AlertTriangle, color: "text-red-400 bg-red-500/15" },
  new_bid: { icon: Gavel, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  approved: { icon: Check, color: "text-emerald-400 bg-emerald-500/15" },
  rejected: { icon: AlertTriangle, color: "text-red-400 bg-red-500/15" },
  payment_due: { icon: Wallet, color: "text-blue-400 bg-blue-500/15" },
  reminder: { icon: Bell, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  system: { icon: ShieldCheck, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  kyc_approved: { icon: ShieldCheck, color: "text-emerald-400 bg-emerald-500/15" },
  kyc_rejected: { icon: ShieldAlert, color: "text-red-400 bg-red-500/15" },
  kyc_expires_soon: { icon: Clock, color: "text-amber-400 bg-amber-500/15" },
  auction_starting_soon: {
    icon: Clock,
    color: "text-[var(--gold)] bg-[var(--gold-faint)]",
  },
  reserve_not_met: { icon: AlertTriangle, color: "text-amber-400 bg-amber-500/15" },
  auction_extended: { icon: Clock, color: "text-amber-400 bg-amber-500/15" },
  deposit_refunded: { icon: RefreshCcw, color: "text-emerald-400 bg-emerald-500/15" },
  deposit_forfeited: { icon: AlertTriangle, color: "text-red-400 bg-red-500/15" },
  payment_received: { icon: CreditCard, color: "text-emerald-400 bg-emerald-500/15" },
  rating_request: { icon: Star, color: "text-[var(--gold)] bg-[var(--gold-faint)]" },
  new_report: { icon: ShieldAlert, color: "text-red-400 bg-red-500/15" },
  account_blocked: { icon: ShieldAlert, color: "text-red-400 bg-red-500/15" },
};

const FALLBACK_META: KindEntry = {
  icon: CheckCircle2,
  color: "text-[var(--gold)] bg-[var(--gold-faint)]",
};

interface Props {
  userId: string;
  /** Called when a row is clicked — lets the parent close the popover. */
  onSelect?: () => void;
}

/**
 * Compact popover variant of the notification feed. Skips the full
 * page-style chrome (big title, filter tabs, paginated load-more) and
 * just shows the most recent items with a header strip + footer link
 * to the full page. Realtime updates flow through the shared hook so
 * the badge count on the bell and this list stay in sync.
 */
export function NotificationsPopupList({ userId, onSelect }: Props) {
  // No `initial` arg here on purpose: the hook fetches when `initial` is
  // undefined. Passing [] was the original bug — `!([])` is false, the
  // fetch was skipped, and the popup permanently rendered "Aucune
  // notification" even when the user had unread items.
  const { items, loaded } = useRealtimeNotifications(userId);
  const locale = useLocale();

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
      {/* Header strip — title, unread chip, mark-all */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
        <h2 className="text-base font-extrabold inline-flex items-center gap-2">
          <Bell className="h-4 w-4 text-[var(--gold)]" />
          Notifications
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] tabular-nums font-extrabold">
              {unreadCount}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={readAll}
          disabled={unreadCount === 0}
          className="text-[12px] font-bold text-[var(--foreground-muted)] hover:text-[var(--gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          <Check className="h-3.5 w-3.5" />
          Tout lu
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
              <Bell className="h-5 w-5" />
            </div>
            <div className="font-bold text-sm">Aucune notification</div>
            <p className="text-xs text-[var(--foreground-muted)] max-w-[260px] mx-auto leading-relaxed">
              Vous serez notifié pour les enchères, les paiements et les
              mises à jour de votre compte.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.slice(0, 20).map((n) => {
              const meta = kindMeta[n.kind] ?? FALLBACK_META;
              const Icon = meta.icon;
              return (
                <li key={n.id}>
                  <Link
                    href={`/notifications/${n.id}`}
                    onClick={() => {
                      if (!n.is_read) markRead(n.id);
                      onSelect?.();
                    }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]",
                      !n.is_read && "bg-[var(--gold-faint)]/20",
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 h-9 w-9 rounded-full flex items-center justify-center",
                        meta.color,
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={cn(
                            "text-[13px] truncate",
                            n.is_read ? "font-semibold" : "font-extrabold",
                          )}
                        >
                          {n.title}
                        </div>
                        {!n.is_read && (
                          <span className="shrink-0 h-2 w-2 rounded-full bg-[var(--gold)] mt-1.5" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[12px] text-[var(--foreground-muted)] line-clamp-2 leading-snug mt-0.5">
                          {n.body}
                        </p>
                      )}
                      <div className="text-[10px] text-[var(--foreground-subtle)] mt-1 tabular-nums">
                        {formatRelative(n.created_at, locale)}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer link to the full page */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/40 shrink-0">
        <Link
          href="/notifications"
          onClick={onSelect}
          className="block text-center text-[12px] font-bold text-[var(--gold)] hover:underline py-3"
        >
          Tout voir →
        </Link>
      </div>
    </>
  );
}

function formatRelative(iso: string, locale: string): string {
  const tag = locale === "ar" ? "ar-TN" : "fr-TN";
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return locale === "ar" ? "الآن" : "à l'instant";
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const days = Math.floor(hr / 24);
  if (days < 30) return rtf.format(-days, "day");
  return new Date(iso).toLocaleDateString(tag);
}
