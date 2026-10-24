import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { XCircle, ArrowLeft, LifeBuoy } from "lucide-react";
import { currencyLabel, formatTND } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Reasons a provider can pass through the failUrl: `payment.failed.reasons.<reason>`. */
const FAIL_REASONS = new Set(["insufficient_funds", "card_declined", "expired", "cancelled", "network", "unknown"]);

/**
 * Post-payment failure page. Shows the reason (if the provider passed
 * one through the failUrl) and offers retry + support CTAs. Pulls the
 * payment row so support can quickly trace the failed reference.
 */
export default async function PaymentFailed({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; reason?: string; return?: string }>;
}) {
  const { id, reason, return: returnUrl } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("payment");
  const safeReturn = returnUrl && returnUrl.startsWith("/") ? returnUrl : "/";

  type PaymentRow = {
    id: string;
    amount: number;
    kind: string;
    auction_id: string | null;
  };
  let payment: PaymentRow | null = null;
  if (id) {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, kind, auction_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      payment = (data as unknown as PaymentRow) ?? null;
    }
  }

  const reasonText = t(`failed.reasons.${reason && FAIL_REASONS.has(reason) ? reason : "unknown"}`);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-7 text-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-500/15 ring-1 ring-red-500/30 flex items-center justify-center">
          <XCircle className="h-9 w-9 text-red-300" strokeWidth={2.2} />
        </div>

        <div className="mt-5 text-[10px] uppercase tracking-[0.18em] font-extrabold text-[var(--danger)]">
          {t("failed.eyebrow")}
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {t("failed.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)] leading-relaxed">
          {reasonText}
        </p>

        {payment && (
          <dl className="mt-6 space-y-2 rounded-[var(--radius)] bg-[var(--surface-2)] p-4 text-start">
            <div className="flex items-center justify-between text-[12px]">
              <dt className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--foreground-muted)]">
                {t("failed.amount")}
              </dt>
              <dd className="batta-tabular font-bold text-foreground">
                {formatTND(Number(payment.amount), locale)} {currencyLabel(locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <dt className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--foreground-muted)]">
                {t("common.reference")}
              </dt>
              <dd className="ltr-island font-mono text-[11px] text-foreground">
                {payment.id.slice(0, 8)}…{payment.id.slice(-4)}
              </dd>
            </div>
            <p className="pt-2 text-[10px] text-[var(--foreground-subtle)] leading-relaxed">
              {t("failed.noDebit")}
            </p>
          </dl>
        )}

        <div className="mt-6 space-y-2">
          <Link
            href={safeReturn as `/${string}`}
            className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-[var(--radius)] bg-gradient-to-b from-[var(--gold-bright)] to-[var(--gold)] text-foreground font-bold text-[14px] shadow-[var(--shadow-gold)] active:scale-[0.99] transition-all"
          >
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
            {t("failed.retry")}
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] text-foreground font-semibold text-[13px] hover:border-[var(--gold-soft)] transition-colors"
          >
            <LifeBuoy className="h-4 w-4" />
            {t("common.support")}
          </Link>
        </div>
      </div>
    </div>
  );
}
