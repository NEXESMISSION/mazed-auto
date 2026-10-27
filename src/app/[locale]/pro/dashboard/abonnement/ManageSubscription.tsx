import { getTranslations } from "next-intl/server";
import { formatTND } from "@/lib/utils";
import { planName, type Plan } from "@/lib/shops/plans";
import type { Quote } from "@/lib/shops/subscription";
import { PostButton } from "../PostButton";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, RotateCcw, XCircle } from "lucide-react";

/** The shop's live subscription, as the page read it (0198). */
export type LiveSubscription = {
  planName: string;
  planCode: string;
  price: number;
  /** The renewal date: the end of the last period. */
  renewsAt: string;
  graceEndsAt: string;
  inGrace: boolean;
  scheduledChange: "cancel" | "downgrade" | null;
  scheduled: { name: string; code: string; price: number; days: number } | null;
  nextPaid: { name: string; start: string; end: string } | null;
};

export type PlanOption = {
  plan: Plan;
  action: "renew" | "upgrade" | "downgrade";
  quote: Quote | null;
  /** The back office approves this first (0196): the button asks instead of paying. */
  approval: boolean;
};

const BTN = "batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px]";
const QUIET = "tap-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-[12.5px] font-bold text-muted hover:border-gold-soft hover:text-foreground";

/**
 * « Mon abonnement »: the plan, its state, the renewal date and what is
 * scheduled for it — then each thing the shop can do, with what it costs and
 * when it takes effect, said again in the confirmation before anything is
 * paid or scheduled. While an order is open nothing else is offered: the
 * database would refuse it (`order_open`).
 */
export async function ManageSubscription({
  shopId,
  locale,
  currency,
  live,
  options,
  canAct,
  orderOpen,
  date,
}: {
  shopId: string;
  locale: string;
  currency: string;
  live: LiveSubscription;
  options: PlanOption[];
  canAct: boolean;
  orderOpen: boolean;
  date: (iso: string) => string;
}) {
  const t = await getTranslations("pro.subscription.manage");
  // A prorated amount has cents, and the cents are charged: show them. Whole
  // prices stay as the rest of the site writes them.
  const money = (n: number | undefined) => {
    const v = Number(n ?? 0);
    return Number.isInteger(v)
      ? formatTND(v, locale)
      : new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  };
  const cancelled = live.scheduledChange === "cancel";
  const renews = options.filter((o) => o.action === "renew");
  const upgrades = options.filter((o) => o.action === "upgrade");
  const downgrades = options.filter((o) => o.action === "downgrade");
  const act = canAct && !orderOpen;

  return (
    <section className="rounded-2xl border border-gold-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-extrabold">{t("title")}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
          cancelled ? "bg-surface-2 text-muted ring-1 ring-border" : live.inGrace ? "batta-tone-warn" : "batta-tone-ok"
        }`}>
          {t(cancelled ? "status.cancelled" : live.inGrace ? "status.grace" : "status.active")}
        </span>
      </div>
      <p className="mt-1 text-[15px] font-black">{t("plan", { plan: live.planName })}</p>

      <div className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-muted">
        {cancelled ? (
          <p className="flex gap-1.5"><XCircle className="mt-0.5 size-3.5 shrink-0" />{t("endsOn", { date: date(live.renewsAt) })}</p>
        ) : live.inGrace ? (
          <p className="flex gap-1.5 text-[var(--tone-warn)]"><CalendarClock className="mt-0.5 size-3.5 shrink-0" />{t("graceUntil", { date: date(live.graceEndsAt) })}</p>
        ) : live.scheduled ? (
          <p className="flex gap-1.5"><ArrowDownRight className="mt-0.5 size-3.5 shrink-0" />
            {t("renewsLower", { date: date(live.renewsAt), plan: live.scheduled.name, price: money(live.scheduled.price), currency })}
          </p>
        ) : (
          <p className="flex gap-1.5"><CalendarClock className="mt-0.5 size-3.5 shrink-0" />
            {t("renewsOn", { date: date(live.renewsAt), price: money(live.price), currency })}
          </p>
        )}
        {live.nextPaid && (
          <p>{t("nextPaid", { plan: live.nextPaid.name, start: date(live.nextPaid.start), end: date(live.nextPaid.end) })}</p>
        )}
        {!cancelled && <p className="text-[11.5px]">{t("noAuto")}</p>}
      </div>

      {orderOpen && <p className="mt-3 text-[12.5px] font-bold text-[var(--tone-warn)]">{t("orderOpen")}</p>}

      {act && (
        <div className="mt-4 space-y-4">
          {/* ── Renewal: the plan (or the lower one scheduled); in grace, any plan ── */}
          {!cancelled && renews.length > 0 && (
            <div>
              <h3 className="text-[12.5px] font-extrabold">{t("renew.title")}</h3>
              {renews[0].quote?.error === "renewal_not_open" ? (
                <p className="mt-1 text-[12px] text-muted">{t("renew.opensOn", { date: date(renews[0].quote.opens_at!) })}</p>
              ) : renews[0].quote?.error === "renewal_already_paid" ? (
                <p className="mt-1 text-[12px] text-muted">{t("renew.paid")}</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {renews.filter((o) => o.quote && !o.quote.error).map((o) => {
                    const q = o.quote!;
                    const args = {
                      plan: planName(o.plan, locale), price: money(q.amount), currency,
                      start: date(q.effective_at!), end: date(q.ends_at!),
                    };
                    return (
                      <li key={o.plan.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <PostButton
                          url="/api/pro/checkout"
                          body={{ shop_id: shopId, plan_code: o.plan.code, intent: "renew" }}
                          confirm={o.approval ? undefined : t("renew.confirm", args)}
                          className={BTN}
                        >
                          <CreditCard className="size-3.5" />
                          {o.approval ? t("ask", { what: args.plan }) : t("renew.button", args)}
                        </PostButton>
                        <span className="min-w-[13rem] flex-1 text-[12px] text-muted">{t("renew.line", args)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── Upgrade: now, prorated ── */}
          {upgrades.length > 0 && (
            <div>
              <h3 className="text-[12.5px] font-extrabold">{t("upgrade.title")}</h3>
              {upgrades[0].quote?.error === "next_period_paid" ? (
                <p className="mt-1 text-[12px] text-muted">{t("upgrade.blockedNext")}</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {upgrades.filter((o) => o.quote && !o.quote.error).map((o) => {
                    const q = o.quote!;
                    const args = {
                      plan: planName(o.plan, locale), amount: money(q.amount), price: money(q.price), currency,
                      date: date(q.renews_at!),
                    };
                    const notes = `${q.withdraws_downgrade ? ` ${t("upgrade.withdraws")}` : ""}${q.keeps_cancel ? ` ${t("upgrade.keepsCancel", { date: date(q.renews_at!) })}` : ""}`;
                    return (
                      <li key={o.plan.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <PostButton
                          url="/api/pro/checkout"
                          body={{ shop_id: shopId, plan_code: o.plan.code, intent: "upgrade" }}
                          confirm={o.approval ? undefined : `${t("upgrade.confirm", args)}${notes}`}
                          className={BTN}
                        >
                          <ArrowUpRight className="size-3.5" />
                          {o.approval ? t("ask", { what: planName(o.plan, locale) }) : t("upgrade.button", args)}
                        </PostButton>
                        <span className="min-w-[13rem] flex-1 text-[12px] text-muted">{t("upgrade.line", args)}{notes}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── Downgrade: at the renewal ── */}
          {!live.inGrace && (downgrades.length > 0 || live.scheduled) && (
            <div>
              <h3 className="text-[12.5px] font-extrabold">{t("downgrade.title")}</h3>
              <ul className="mt-1 space-y-2">
                {/* The scheduled plan is also the renewal's, so it is not among the choices above. */}
                {live.scheduled && !downgrades.some((o) => o.plan.code === live.scheduled!.code) && (
                  <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold/30">
                      <ArrowDownRight className="size-3.5" /> {t("downgrade.scheduled", { plan: live.scheduled.name })}
                    </span>
                    <span className="min-w-[13rem] flex-1 text-[12px] text-muted">
                      {t("downgrade.line", {
                        plan: live.scheduled.name, price: money(live.scheduled.price), currency,
                        date: date(live.renewsAt), days: live.scheduled.days,
                      })}
                    </span>
                  </li>
                )}
                {downgrades.map((o) => {
                  const isScheduled = live.scheduled?.code === o.plan.code;
                  const args = {
                    plan: planName(o.plan, locale), price: money(o.plan.price), currency,
                    date: date(live.renewsAt), days: o.plan.durationDays,
                  };
                  return (
                    <li key={o.plan.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {isScheduled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold/30">
                          <ArrowDownRight className="size-3.5" /> {t("downgrade.scheduled", { plan: args.plan })}
                        </span>
                      ) : (
                        <PostButton
                          url="/api/pro/subscription"
                          body={{ shop_id: shopId, action: "downgrade", plan_code: o.plan.code }}
                          confirm={`${t("downgrade.confirm", args)}${cancelled ? ` ${t("downgrade.replacesCancel")}` : ""}`}
                          className={QUIET}
                        >
                          <ArrowDownRight className="size-3.5" /> {live.scheduled ? t("downgrade.change", args) : t("downgrade.button", args)}
                        </PostButton>
                      )}
                      <span className="min-w-[13rem] flex-1 text-[12px] text-muted">{t("downgrade.line", args)}</span>
                    </li>
                  );
                })}
              </ul>
              {live.scheduled && (
                <PostButton
                  url="/api/pro/subscription"
                  body={{ shop_id: shopId, action: "undo_downgrade" }}
                  confirm={t("undoConfirm", { plan: live.planName })}
                  className={`${QUIET} mt-2`}
                >
                  <RotateCcw className="size-3.5" /> {t("undo", { plan: live.planName })}
                </PostButton>
              )}
            </div>
          )}

          {/* ── Cancel / resume ── */}
          <div className="border-t border-border pt-3">
            {cancelled ? (
              <PostButton
                url="/api/pro/subscription"
                body={{ shop_id: shopId, action: "resume" }}
                confirm={t("resume.confirm", { date: date(live.renewsAt) })}
                className={BTN}
              >
                <RotateCcw className="size-3.5" /> {t("resume.button")}
              </PostButton>
            ) : (
              <PostButton
                url="/api/pro/subscription"
                body={{ shop_id: shopId, action: "cancel" }}
                confirm={`${t("cancel.confirm", { date: date(live.renewsAt) })}${live.scheduled ? ` ${t("upgrade.withdraws")}` : ""}`}
                className={QUIET}
              >
                <XCircle className="size-3.5" /> {t("cancel.button")}
              </PostButton>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
