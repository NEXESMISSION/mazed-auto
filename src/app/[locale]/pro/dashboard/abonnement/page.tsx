/* eslint-disable react-hooks/purity -- Server Component: reads the clock once
 * per request to tell current periods from past ones. */
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { currencyLabel, formatTND } from "@/lib/utils";
import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { planLimitFor, planName, plansForSale } from "@/lib/shops/plans";
import { PostButton } from "../PostButton";
import { PaymentStatus } from "./PaymentStatus";
import { CreditCard, FileText } from "lucide-react";

// The words are under `pro.subscription.payStatus` / `.provider`.
const PAY_STATUS = ["pending", "pending_review", "captured", "failed", "refunded"];
const PROVIDER = ["konnect", "bank_transfer", "manual"];

/**
 * Abonnement — the shop's periods, the plans it can buy next, and every
 * payment it made, with its receipt. Renewal is explicit: buying a plan
 * while a period is running adds the next period after it (0191).
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
  const canBuy = CAN_EDIT_SHOP.includes(role) && !["suspended", "closed", "rejected"].includes(shop.status);

  const [plans, subRes, payRes] = await Promise.all([
    plansForSale(admin),
    admin
      .from("subscriptions")
      .select("id, starts_at, ends_at, grace_ends_at, status, reason, limits, product:products (name_fr, name_ar, plan_code)")
      .eq("shop_id", shop.id)
      .order("starts_at", { ascending: false })
      .limit(12),
    admin
      .from("payments")
      .select("id, kind, amount, status, provider, created_at, receipt_number, metadata")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  type Sub = {
    id: string; starts_at: string; ends_at: string; grace_ends_at: string; status: string; reason: string | null;
    limits: { vehicles: number; parts: number };
    product: SubProduct | SubProduct[] | null;
  };
  type SubProduct = { name_fr: string; name_ar: string | null; plan_code: string };
  // The 12 latest periods, read in the order they run.
  const subs = ((subRes.data ?? []) as unknown as Sub[]).reverse();
  const now = Date.now();
  const date = (iso: string) => formatDate(iso, locale, { day: "numeric", month: "short", year: "numeric" });
  const name = (s: Sub) => {
    const p = Array.isArray(s.product) ? s.product[0] : s.product;
    return (locale === "ar" && p?.name_ar ? p.name_ar : p?.name_fr) ?? "—";
  };
  const current = subs.find((s) => new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime());

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
  const currentCode = current ? (Array.isArray(current.product) ? current.product[0]?.plan_code : current.product?.plan_code) : null;

  return (
    <div className="space-y-5">
      {sp.payment && /^[0-9a-f-]{36}$/i.test(sp.payment) && <PaymentStatus paymentId={sp.payment} draftWaiting={draftWaiting} />}

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

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[14px] font-extrabold">{current ? t("renewOrChange") : t("choose")}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          {current ? t("renewHint") : shop.status === "draft" ? t("draftHint") : t("startHint")}{" "}
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
                <div key={p.code} className={`rounded-xl border p-3 ${currentCode === p.code ? "border-gold-soft" : "border-border"}`}>
                  <p className="font-extrabold">{planName(p, locale)}{currentCode === p.code && <span className="ms-1 text-[11px] font-bold text-gold">{t("currentPlan")}</span>}</p>
                  <p className="batta-tabular text-[18px] font-black">{formatTND(p.price, locale)} {tnd}</p>
                  <p className="text-[11.5px] text-muted">{t("planLine", { count: formatTND(lim.n, locale), bucket: tb(lim.bucket), days: p.durationDays })}</p>
                  {canBuy && (
                    <PostButton
                      url="/api/pro/checkout"
                      body={{ shop_id: shop.id, plan_code: p.code }}
                      className="batta-btn-luxe tap-target mt-2 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12.5px]"
                    >
                      <CreditCard className="size-3.5" /> {current && currentCode === p.code ? t("renew") : t("pick")}
                    </PostButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
