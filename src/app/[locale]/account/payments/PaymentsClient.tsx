"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { currencyLabel, formatTND } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { governorateLabel } from "@/lib/labels";
import {
  Wallet,
  FileText,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Clock,
  AlertTriangle,
  MapPin,
  TrendingUp,
  ListFilter,
  X,
  Loader2,
} from "lucide-react";

/** A user-cancelled pending payment is stored as `failed` with this exact
 *  marker (see /api/payments/[id]/cancel) — we display it as a neutral
 *  "Annulé", not as a failed payment to redo. It is data, not copy: never
 *  translate it. */
const CANCELLED_NOTE = "Annulé par l'utilisateur";
function isCancelled(p: { status: string; adminNotes: string | null }): boolean {
  return p.status === "failed" && p.adminNotes === CANCELLED_NOTE;
}

export type DepositLifecycle = "locked" | "to_refund" | "refunded" | "forfeited";

export type PaymentVM = {
  id: string;
  kind: string;
  provider: string;
  amount: number;
  status: string;
  createdAt: string;
  adminNotes: string | null;
  /** Signed, time-limited URL for the uploaded receipt (private bucket). */
  receiptUrl: string | null;
  auctionId: string | null;
  /** Set on a shop's order (subscription, Boost): its page is where it is paid again. */
  shopId: string | null;
  title: string | null;
  governorate: string | null;
  coverUrl: string | null;
  /** Real caution lifecycle for `deposit_lock` rows, derived from auction_deposits. */
  depositStatus: DepositLifecycle | null;
};

export type PaymentsSummary = {
  actionCount: number;
  reviewCount: number;
  lockedTotal: number;
  spentTotal: number;
  refundedTotal: number;
};

/** Kinds with a label under `myAccount.payments.kinds`. The auction-era ones
 *  stay only so an old row still reads properly; listing_fee, listing_pack,
 *  renewal, promo and badge are what the product charges today. */
const KNOWN_KINDS = new Set([
  "deposit_lock", "buy_now", "final_payment", "commission", "inspection_fee", "subscription",
  "deposit_release", "listing_fee", "listing_pack", "renewal", "promo", "badge",
]);

/** Tone per status; the label is `myAccount.payments.status.<status>`. */
const STATUS_TONE: Record<string, string> = {
  pending: "batta-tone-warn",
  pending_review: "batta-tone-warn",
  captured: "batta-tone-ok",
  refunded: "bg-surface-2 text-muted ring-1 ring-border",
  failed: "batta-tone-bad",
};

/** For a `deposit_lock`, the right-hand badge reflects where the money
 *  actually is, not the flat payment status. Label: `payments.deposit.<status>`. */
const DEPOSIT_TONE: Record<DepositLifecycle, string> = {
  locked: "bg-gold-faint text-gold-bright ring-1 ring-gold/30",
  to_refund: "batta-tone-warn",
  refunded: "batta-tone-ok",
  forfeited: "batta-tone-bad",
};

/** The `myAccount.payments` translator, as the helpers below use it. */
type T = (key: string, values?: Record<string, string>) => string;

const kindLabel = (t: T, kind: string) => (KNOWN_KINDS.has(kind) ? t(`kinds.${kind}`) : kind);

/** db kind → checkout `type` param, so a rejected payment can be redone
 *  through the same entry that created it (inspection_fee has no type). */
const KIND_TO_CHECKOUT: Record<string, string> = {
  deposit_lock: "deposit",
  buy_now: "buy_now",
  final_payment: "final_payment",
  listing_fee: "listing_fee",
};

function providerLabel(t: T, provider: string): string {
  switch (provider) {
    case "d17":
      return "D17";
    case "bank_transfer":
    case "manual":
      return t(`providers.${provider}`);
    default:
      return provider;
  }
}

/** Where the primary action button leads:
 *  - pending / pending_review → the existing checkout (upload, or see where
 *    the receipt stands and replace it)
 *  - failed → where that order is placed again: a shop's subscription page,
 *    or the seller's annonces. It used to need an auction id, which no
 *    payment has any more, so a refused payment led nowhere.  */
function actionHref(p: PaymentVM): string | null {
  if (isCancelled(p)) return null;
  if (p.status === "pending" || p.status === "pending_review") {
    return `/payment/checkout?payment=${p.id}`;
  }
  if (p.status === "failed") {
    if (p.shopId || p.kind === "subscription") return "/pro/dashboard/abonnement";
    if (p.kind === "listing_fee" || p.kind === "renewal" || p.kind === "promo") return "/account/listings";
    const type = KIND_TO_CHECKOUT[p.kind];
    if (type && p.auctionId) return `/payment/checkout?type=${type}&auction=${p.auctionId}`;
    return p.auctionId ? `/auctions/${p.auctionId}` : null;
  }
  return null;
}

function actionLabel(t: T, p: PaymentVM): string {
  if (p.status === "pending") return t("actions.upload");
  if (p.status === "pending_review") return t("actions.fix");
  return t("actions.retry");
}

// No « Cautions » tab: deposits went with the auctions, and the tab was always
// empty. « Frais & abonnements » holds what the site charges today.
type FilterKey = "all" | "action" | "purchases" | "refunds";

const PURCHASE_KINDS = new Set([
  "subscription", "promo", "badge", "listing_fee", "listing_pack", "renewal",
  "buy_now", "final_payment", "inspection_fee",
]);

function matchesFilter(p: PaymentVM, key: FilterKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "action":
      return (
        (p.status === "pending" || p.status === "pending_review" || p.status === "failed") &&
        !isCancelled(p)
      );
    case "purchases":
      return PURCHASE_KINDS.has(p.kind);
    case "refunds":
      return (
        p.status === "refunded" ||
        p.kind === "deposit_release" ||
        p.depositStatus === "refunded" ||
        p.depositStatus === "to_refund"
      );
    default:
      return true;
  }
}

export function PaymentsClient({
  payments,
  summary,
  locale,
}: {
  payments: PaymentVM[];
  summary: PaymentsSummary;
  locale: string;
}) {
  const t = useTranslations("myAccount.payments");
  const cur = currencyLabel(locale);
  const [filter, setFilter] = useState<FilterKey>("all");
  const router = useRouter();
  const { toast } = useToast();

  async function cancelPayment(id: string): Promise<boolean> {
    const res = await fetch(`/api/payments/${id}/cancel`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast(j.detail ?? j.error ?? t("cancelFailed"), "error");
      return false;
    }
    toast(t("cancelled"), "success");
    router.refresh();
    return true;
  }

  // Items that genuinely need the buyer to act: upload a receipt or redo a
  // rejected payment. `pending_review` is informational, so it's excluded.
  const todo = useMemo(
    () =>
      payments.filter(
        (p) => p.status === "pending" || (p.status === "failed" && !isCancelled(p)),
      ),
    [payments],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, action: 0, purchases: 0, refunds: 0 };
    for (const p of payments) {
      (Object.keys(c) as FilterKey[]).forEach((k) => {
        if (matchesFilter(p, k)) c[k] += 1;
      });
    }
    return c;
  }, [payments]);

  const visible = useMemo(() => payments.filter((p) => matchesFilter(p, filter)), [payments, filter]);

  const TABS: { key: FilterKey; label: string }[] = (
    ["all", "action", "purchases", "refunds"] as const
  ).map((key) => ({ key, label: t(`tabs.${key}`) }));

  return (
    <div className="mt-6">
      {/* ── Summary cards — the four signals that matter, at a glance. ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t("stats.action")}
          value={String(summary.actionCount)}
          Icon={AlertTriangle}
          tone={summary.actionCount > 0 ? "text-amber-600" : "text-foreground/50"}
          highlight={summary.actionCount > 0}
        />
        <StatCard
          label={t("stats.spent")}
          value={formatTND(summary.spentTotal, locale)}
          suffix={cur}
          Icon={TrendingUp}
          tone="text-foreground/70"
        />
        <StatCard
          label={t("stats.review")}
          value={String(summary.reviewCount)}
          Icon={Clock}
          tone="text-foreground/70"
        />
      </div>

      {/* ── "À traiter" strip — receipts to upload + rejected payments to redo. ── */}
      {todo.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30">
          <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-2">
            <AlertTriangle className="size-3.5 text-amber-600" strokeWidth={2.6} />
            <span className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-amber-700">
              {t("todo")}
            </span>
            <span className="batta-tabular ms-0.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-extrabold text-amber-700">
              {todo.length}
            </span>
          </div>
          <ul className="divide-y divide-amber-500/15">
            {todo.map((p) => {
              const href = actionHref(p);
              const inner = (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 transition hover:bg-amber-500/10">
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-sm text-foreground/20">
                        🏛️
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-foreground">
                      {kindLabel(t, p.kind)}
                      {" · "}
                      <span className="batta-tabular">{formatTND(p.amount, locale)} {cur}</span>
                    </div>
                    <div className="truncate text-[11px] font-semibold text-amber-700">
                      {p.status === "pending"
                        ? t("toUpload")
                        : p.adminNotes
                          ? t("refusedWith", { notes: p.adminNotes })
                          : t("refused")}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-amber-600 rtl:-scale-x-100" strokeWidth={2.4} />
                </div>
              );
              return (
                <li key={p.id}>
                  {href ? (
                    <Link href={href as "/payment/checkout"}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
        {TABS.map(({ key, label }) => {
          const on = filter === key;
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-all lg:text-[13px] ${
                on
                  ? "batta-gradient-gold text-white shadow-[var(--shadow-gold)]"
                  : "bg-surface-2 text-muted ring-1 ring-border hover:text-foreground"
              }`}
            >
              {key === "all" && <ListFilter className="size-3.5" strokeWidth={2.5} />}
              {label}
              {count > 0 && (
                <span
                  className={`batta-tabular ms-0.5 rounded-full px-1.5 text-[10px] font-extrabold ${
                    on ? "bg-surface/40" : "bg-surface text-foreground/70"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Rows ── */}
      {visible.length === 0 ? (
        <div className="batta-frame-gold relative mt-5 px-6 py-10 text-center">
          <Wallet className="mx-auto size-8 text-gold" strokeWidth={2} />
          <p className="mt-3 text-[13px] text-muted">{t("emptyFilter")}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {visible.map((p) => (
            <li key={p.id} id={`pay-${p.id}`}>
              <PaymentRow p={p} locale={locale} onCancel={cancelPayment} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  Icon,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  Icon: typeof Wallet;
  tone: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ring-1 lg:p-5 ${
        highlight ? "bg-amber-500/10 ring-amber-500/30" : "bg-surface ring-border"
      }`}
    >
      <span
        className={`inline-flex size-9 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-border lg:size-10 ${tone}`}
      >
        <Icon className="size-4 lg:size-5" strokeWidth={2.2} />
      </span>
      <div className="batta-tabular mt-3 flex items-baseline gap-1 text-[20px] font-extrabold leading-none text-foreground lg:text-[24px]">
        {value}
        {suffix && <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{suffix}</span>}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-muted lg:text-[12px]">{label}</div>
    </div>
  );
}

/** Caution lifecycle chip (shown in the chips row for deposit_release / refund context). */
function lifecycleChip(status: DepositLifecycle) {
  const map = {
    locked: Wallet,
    to_refund: RefreshCw,
    refunded: CheckCircle2,
    forfeited: ShieldAlert,
  } as const;
  return map[status];
}

function PaymentRow({
  p,
  locale,
  onCancel,
}: {
  p: PaymentVM;
  locale: string;
  onCancel: (id: string) => Promise<boolean>;
}) {
  const t = useTranslations("myAccount.payments");
  const cur = currencyLabel(locale);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelled = isCancelled(p);

  // For a deposit, the badge tells the user where the caution is now.
  const badge = cancelled
    ? { label: t("status.cancelled"), tone: "bg-surface-2 text-muted ring-1 ring-border" }
    : p.kind === "deposit_lock" && p.depositStatus
      ? { label: t(`deposit.${p.depositStatus}`), tone: DEPOSIT_TONE[p.depositStatus] }
      : STATUS_TONE[p.status]
        ? { label: t(`status.${p.status}`), tone: STATUS_TONE[p.status] }
        : { label: p.status, tone: "bg-surface-2 text-muted ring-1 ring-border" };

  const canResume =
    (p.status === "pending" || p.status === "pending_review" || p.status === "failed") && !cancelled;
  // Cancel is only offered before a receipt is uploaded — i.e. the "À traiter"
  // rows the user hasn't acted on yet. (The API enforces the same rule.)
  const canCancel = p.status === "pending";
  const aHref = actionHref(p);
  const entityHref = p.auctionId ? (`/auctions/${p.auctionId}` as `/auctions/${string}`) : null;
  const showFooter = (canResume && aHref) || canCancel || p.receiptUrl || entityHref;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-surface ring-1 ring-border">
      <div className="flex items-start gap-3 p-4">
        {/* Cover thumbnail when a property/auction is linked. */}
        {(p.coverUrl || p.title) && (
          <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
            {p.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-lg text-foreground/20">
                🏛️
              </span>
            )}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gold">
            {kindLabel(t, p.kind)}
          </div>
          {p.title && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] font-bold text-foreground">
              <span className="truncate">{p.title}</span>
            </div>
          )}
          <div className="batta-tabular mt-1 text-[18px] font-extrabold text-foreground">
            {formatTND(p.amount, locale)}{" "}
            <span className="text-[10px] font-bold uppercase text-muted">{cur}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
            <span>
              {formatDate(p.createdAt, locale, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span aria-hidden>·</span>
            <span>{providerLabel(t, p.provider)}</span>
            {p.governorate && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="size-3" strokeWidth={2} />
                  {governorateLabel(p.governorate, locale)}
                </span>
              </>
            )}
          </div>

          {/* Rejection reason — surfaced inline so the user knows what to fix.
              Hidden for user-cancelled rows (the "motif" would just be our
              own marker). */}
          {p.status === "failed" && !cancelled && p.adminNotes && (
            <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-500/20">
              {t("reason", { notes: p.adminNotes })}
            </div>
          )}

          {/* Refund lifecycle hint for deposits flagged / refunded. */}
          {p.kind === "deposit_lock" &&
            (p.depositStatus === "to_refund" || p.depositStatus === "refunded") && (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                {(() => {
                  const Icon = lifecycleChip(p.depositStatus);
                  return (
                    <>
                      <Icon className="size-3 text-gold" strokeWidth={2.2} />
                      {t(`lifecycle.${p.depositStatus}`)} · {formatTND(p.amount, locale)} {cur}
                    </>
                  );
                })()}
              </div>
            )}
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.14em] ${badge.tone}`}
        >
          {badge.label}
        </span>
      </div>

      {showFooter && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          {canResume && aHref && (
            <Link
              href={aHref as "/payment/checkout"}
              className="batta-btn-luxe tap-target rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.12em]"
            >
              {actionLabel(t, p)}
              <ArrowRight className="size-3 rtl:-scale-x-100" strokeWidth={2.5} />
            </Link>
          )}

          {/* Cancel — only for pending (not-yet-paid) rows. Two-tap confirm. */}
          {canCancel &&
            (confirming ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await onCancel(p.id);
                    if (!ok) {
                      setBusy(false);
                      setConfirming(false);
                    }
                  }}
                  className="tap-target inline-flex items-center gap-1 rounded-full bg-[var(--danger)] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" strokeWidth={2.6} />}
                  {t("confirm")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="tap-target inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-foreground disabled:opacity-50"
                >
                  {t("no")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="tap-target inline-flex items-center gap-1 rounded-full border border-[var(--accent-soft)] bg-[var(--accent-faint)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-deep)] transition hover:bg-[var(--accent)]/10"
              >
                <X className="size-3" strokeWidth={2.5} />
                {t("cancel")}
              </button>
            ))}
          {p.receiptUrl && (
            <a
              href={p.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-foreground hover:border-gold-soft/50"
            >
              <FileText className="size-3 text-gold" strokeWidth={2} />
              {t("receipt")}
            </a>
          )}
          {entityHref && (
            <Link
              href={entityHref}
              className="tap-target ms-auto inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-gold-bright"
            >
              {t("viewListing")}
              <ChevronRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
