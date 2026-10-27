/* eslint-disable react-hooks/purity -- Server Component: reads the clock once
 * per request to tell current periods from past ones. */
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { currencyLabel, formatTND } from "@/lib/utils";
import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { planLimitFor, planName, plansForSale } from "@/lib/shops/plans";
import { approvalsSetting, isolated, planKind, requestProductName, shopRequests } from "@/lib/shops/approvals";
import { PostButton } from "../PostButton";
import { PaymentStatus } from "./PaymentStatus";
import { ManageSubscription, type LiveSubscription, type PlanOption } from "./ManageSubscription";
import { quoteFor, type Intent } from "@/lib/shops/subscription";
import { CreditCard, FileText } from "lucide-react";

// The words are under `pro.subscription.payStatus` / `.provider`.
const PAY_STATUS = ["pending", "pending_review", "captured", "failed", "refunded"];
const PROVIDER = ["konnect", "bank_transfer", "manual"];

/**
 * Abonnement — the shop's ONE subscription (0198) and what can be done with
 * it, its periods, and every payment it made, with its receipt.
 *
 * Without a subscription the plans are offered to subscribe. With one, they
 * are never a second purchase: « Mon abonnement » renews it, upgrades it now
 * (prorated, same renewal date), schedules a downgrade or a cancellation for
 * the renewal date — each with its price and date before the confirmation.
 * The prices come from the database (`subscription_quote`), the one that
 * charges them.
 *
 * What the back office has to approve first (0196) is asked for from the same
 * buttons, labelled « Demander »; the requests sit at the top, with the way to
 * pay once one is accepted and the reason when one is refused.
 */
export default async function ProSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop, role, user } = ctx;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("pro.subscription");
  const tb = await getTranslations("pro.bucket");
  const tnd = currencyLabel(locale);

  const [plans, subRes, payRes, approvals, requests] = await Promise.all([
    plansForSale(admin),
    admin
      .from("subscriptions")
      .select(
        "id, starts_at, ends_at, grace_ends_at, status, reason, limits, scheduled_change, "
        + "product:products!subscriptions_product_id_fkey (id, name_fr, name_ar, plan_code, price), "
        + "scheduled:products!subscriptions_scheduled_product_id_fkey (name_fr, name_ar, plan_code, price, duration_days)",
      )
      .eq("shop_id", shop.id)
      .order("starts_at", { ascending: false })
      .limit(12),
    admin
      .from("payments")
      .select("id, kind, amount, status, provider, created_at, receipt_number, metadata")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(30),
    approvalsSetting(admin),
    shopRequests(admin, shop.id),
  ]);
  // A refused shop may ask to open again, when openings are approved at all.
  const canBuy = CAN_EDIT_SHOP.includes(role)
    && !["suspended", "closed"].includes(shop.status)
    && (shop.status !== "rejected" || approvals.opening);

  type Sub = {
    id: string; starts_at: string; ends_at: string; grace_ends_at: string; status: string; reason: string | null;
    limits: { vehicles: number; parts: number };
    scheduled_change: "cancel" | "downgrade" | null;
    product: SubProduct | SubProduct[] | null;
    scheduled: SubProduct | SubProduct[] | null;
  };
  type SubProduct = { id?: string; name_fr: string; name_ar: string | null; plan_code: string; price: number; duration_days?: number };
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  // The 12 latest periods, read in the order they run.
  const subs = ((subRes.data ?? []) as unknown as Sub[]).reverse();
  const now = Date.now();
  const date = (iso: string) => formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric" });
  const name = (s: Sub) => {
    const p = Array.isArray(s.product) ? s.product[0] : s.product;
    return (locale === "ar" && p?.name_ar ? p.name_ar : p?.name_fr) ?? "—";
  };
  const current = subs.find((s) => new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime());
  // The live subscription: periods not past their grace, the last of which
  // carries the renewal date and what is scheduled for it.
  const liveSubs = subs.filter((s) => ["active", "grace"].includes(s.status) && now < new Date(s.grace_ends_at).getTime());
  const last = liveSubs.length ? liveSubs.reduce((a, b) => (new Date(b.ends_at) > new Date(a.ends_at) ? b : a)) : null;
  const nextPaid = liveSubs.find((s) => new Date(s.starts_at).getTime() > now) ?? null;
  const openOrder = (payRes.data ?? []).find((p) => p.kind === "subscription" && ["pending", "pending_review"].includes(p.status as string));

  // Back from paying, perhaps sent here by the listing limit with an annonce
  // saved but not online. /annonces/nouvelle resumes the latest draft, and
  // /submit moves a personal one of this shop's activity into the shop
  // (shopForPersonalDraft) — so point at it, it is what they came to do.
  let draftWaiting = false;
  if (sp.payment) {
    const { data: draft } = await admin
      .from("listings")
      .select("shop_id, listing_type")
      .eq("seller_id", user.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    draftWaiting = draft != null && draft.shop_id == null && draft.listing_type === shop.activity_type;
  }

  // What each plan button would be — opening, renewal or change — and whether
  // the back office approves that first (the same rule as pro_request_kind).
  const periods = subs.filter((s) => s.status !== "cancelled");
  const latest = periods[periods.length - 1];
  const latestCode = latest ? (Array.isArray(latest.product) ? latest.product[0]?.plan_code : latest.product?.plan_code) : null;
  const needsApproval = (code: string) => approvals[planKind(latestCode, periods.length > 0, code)];
  const openPlan = requests.open.find((r) => r.kind !== "boost") ?? null;
  const anyApproval = plans.some((p) => needsApproval(p.code));

  // What each plan is for the live subscription, priced by the database.
  let live: LiveSubscription | null = null;
  let options: PlanOption[] = [];
  if (last) {
    const lastProduct = one(last.product);
    const sched = one(last.scheduled);
    const inGrace = new Date(last.ends_at).getTime() <= now;
    const curProduct = one(current?.product ?? null);
    const curPrice = curProduct ? Number(curProduct.price) : null;
    const lastPrice = Number(lastProduct?.price ?? 0);
    const renewCode = sched?.plan_code ?? lastProduct?.plan_code;
    live = {
      planName: name(current ?? last),
      planCode: lastProduct?.plan_code ?? "",
      price: lastPrice,
      renewsAt: last.ends_at,
      graceEndsAt: last.grace_ends_at,
      inGrace,
      scheduledChange: last.scheduled_change,
      scheduled: sched
        ? { name: locale === "ar" && sched.name_ar ? sched.name_ar : sched.name_fr, code: sched.plan_code, price: Number(sched.price), days: Number(sched.duration_days ?? 30) }
        : null,
      nextPaid: nextPaid ? { name: name(nextPaid), start: nextPaid.starts_at, end: nextPaid.ends_at } : null,
    };
    const wanted: { plan: (typeof plans)[number]; action: PlanOption["action"] }[] = [];
    for (const p of plans) {
      if (curPrice != null && p.price > curPrice && !inGrace) wanted.push({ plan: p, action: "upgrade" });
      else if (inGrace || p.code === renewCode) wanted.push({ plan: p, action: "renew" });
      else if (p.price < lastPrice) wanted.push({ plan: p, action: "downgrade" });
    }
    options = await Promise.all(wanted.map(async (w) => ({
      ...w,
      quote: w.action === "downgrade" ? null : await quoteFor(admin, shop.id, w.plan.id, w.action as Intent),
      approval: needsApproval(w.plan.code),
    })));
  }

  return (
    <div className="space-y-5">
      {sp.payment && /^[0-9a-f-]{36}$/i.test(sp.payment) && <PaymentStatus paymentId={sp.payment} draftWaiting={draftWaiting} />}

      {(requests.open.length > 0 || requests.lastDecision) && (
        <section className="rounded-2xl border border-gold-soft bg-surface p-4">
          <h2 className="text-[14px] font-extrabold">{t("requests.title")}</h2>
          <ul className="mt-1 divide-y divide-border">
            {requests.open.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 text-[13px]">
                <span className="min-w-[13rem] flex-1">
                  <span className="font-bold">
                    {t(`requests.kind.${r.kind}`)} · {requestProductName(r, locale)}
                    {r.listingTitle && <span className="font-normal text-muted"> · {r.listingTitle}</span>}
                  </span>
                  <span className={`block text-[12px] ${r.status === "approved" ? "text-[var(--tone-ok)]" : "text-muted"}`}>
                    {r.status === "pending"
                      ? t("requests.pending", { date: date(r.createdAt) })
                      : t("requests.approved", { date: date(r.decidedAt ?? r.createdAt) })}
                  </span>
                </span>
                {canBuy && (
                  <span className="flex flex-wrap gap-2">
                    {r.status === "approved" && (
                      <PostButton
                        url="/api/pro/checkout"
                        body={r.kind === "boost"
                          ? { listing_id: r.listingId, product: "boost-7j" }
                          : { shop_id: shop.id, plan_code: r.product.planCode }}
                        className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px]"
                      >
                        <CreditCard className="size-3.5" /> {t("requests.pay", { price: formatTND(r.product.price, locale), currency: tnd })}
                      </PostButton>
                    )}
                    <PostButton
                      url={`/api/pro/requests/${r.id}`}
                      body={{ action: "cancel" }}
                      confirm={t("requests.confirmCancel")}
                      className="tap-target rounded-full border border-border px-3 py-2 text-[12.5px] font-bold text-muted hover:border-gold-soft hover:text-foreground"
                    >
                      {t("requests.cancel")}
                    </PostButton>
                  </span>
                )}
              </li>
            ))}
            {requests.lastDecision && (
              <li className="py-2.5 text-[13px]">
                <span className="font-bold">
                  {t(`requests.kind.${requests.lastDecision.kind}`)} · {requestProductName(requests.lastDecision, locale)}
                </span>
                <span className="block text-[12px] text-[var(--danger)]">
                  {requests.lastDecision.status === "rejected"
                    ? t("requests.rejected", { reason: isolated(requests.lastDecision.reason ?? "") })
                    : t("requests.revoked", { reason: isolated(requests.lastDecision.reason ?? "") })}
                </span>
                {canBuy && <span className="block text-[12px] text-muted">{t("requests.askAgain")}</span>}
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("periods")}</h2>
        {subs.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">{t("noPeriods")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {subs.map((s) => {
              const start = new Date(s.starts_at).getTime();
              const end = new Date(s.ends_at).getTime();
              const state = start > now ? "upcoming" : now < end ? "current" : now < new Date(s.grace_ends_at).getTime() ? "grace" : "ended";
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <span className="font-bold">{name(s)}</span>
                  <span className="text-muted">{date(s.starts_at)} <span className="inline-block rtl:-scale-x-100">→</span> {date(s.ends_at)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${state === "current" ? "batta-tone-ok" : state === "grace" ? "batta-tone-warn" : "bg-surface-2 text-muted ring-1 ring-border"}`}>
                    {t(`state.${state}`)}{s.reason === "migration" ? ` · ${t("gifted")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {live ? (
        <ManageSubscription
          shopId={shop.id}
          locale={locale}
          currency={tnd}
          live={live}
          options={options}
          canAct={canBuy}
          orderOpen={Boolean(openOrder)}
          date={date}
        />
      ) : (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("choose")}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          {["draft", "pending_review", "rejected"].includes(shop.status)
            ? approvals.opening ? t("draftHintApproval") : t("draftHint")
            : t("startHint")}{" "}
          {/* The opening sentence already says it when the shop is not open yet. */}
          {anyApproval && (shop.status === "active" || !approvals.opening) && <>{t("approvalHint")} </>}
          {t("noDebit")}
        </p>
        {plans.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">
            {t.rich("notForSale", {
              link: (chunks) => <Link href={"/contact" as never} className="font-bold text-gold hover:underline">{chunks}</Link>,
            })}
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {plans.map((p) => {
              const lim = planLimitFor(p, shop.activity_type);
              return (
                <div key={p.code} className="rounded-xl border border-border p-3">
                  <p className="font-extrabold">{planName(p, locale)}</p>
                  <p className="batta-tabular text-[18px] font-black">{formatTND(p.price, locale)} {tnd}</p>
                  <p className="text-[11.5px] text-muted">{t("planLine", { count: formatTND(lim.n, locale), bucket: tb(lim.bucket), days: p.durationDays })}</p>
                  {canBuy && !openOrder && (
                    <PostButton
                      url="/api/pro/checkout"
                      body={{ shop_id: shop.id, plan_code: p.code, intent: "subscribe" }}
                      className="batta-btn-luxe tap-target mt-2 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12.5px]"
                    >
                      <CreditCard className="size-3.5" />{" "}
                      {openPlan?.status === "approved" && openPlan.product.planCode === p.code
                        ? t("requests.pay", { price: formatTND(p.price, locale), currency: tnd })
                        : needsApproval(p.code) ? t("ask") : t("pick")}
                    </PostButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{t("payments")}</h2>
        {(payRes.data ?? []).length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">{t("noPayments")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {(payRes.data ?? []).map((p) => (
              <li key={p.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="font-bold">
                  {p.kind === "subscription" ? t("kindSubscription") : t("kindBoost")} · {Number(p.amount).toLocaleString("fr-FR")} {tnd}
                </span>
                <span className="text-muted">
                  {date(p.created_at as string)} · {PROVIDER.includes(p.provider as string) ? t(`provider.${p.provider as string}`) : p.provider}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{PAY_STATUS.includes(p.status as string) ? t(`payStatus.${p.status as string}`) : p.status}</span>
                  {p.status === "captured" && (
                    <Link href={`/pro/dashboard/abonnement/recu/${p.id}` as never} className="inline-flex items-center gap-1 font-bold text-gold hover:underline">
                      <FileText className="size-3.5" /> {t("receipt", { number: p.receipt_number as string })}
                    </Link>
                  )}
                  {p.status === "pending" && p.provider !== "konnect" && (
                    <Link href={`/payment/checkout?payment=${p.id}` as never} className="font-bold text-gold hover:underline">{t("settle")}</Link>
                  )}
                  {/* An abandoned order holds the shop's one order slot (0198): it can be let go — an online one
                      only once Konnect's link has long expired. */}
                  {canBuy && p.status === "pending" && (p.provider !== "konnect" || now - new Date(p.created_at as string).getTime() > 2 * 3600_000) && (
                    <PostButton
                      url={`/api/payments/${p.id as string}/cancel`}
                      confirm={t("manage.cancelOrderConfirm")}
                      className="font-bold text-muted hover:text-foreground"
                    >
                      {t("manage.cancelOrder")}
                    </PostButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
