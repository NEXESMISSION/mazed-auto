/* eslint-disable react-hooks/purity -- Server Component.
 * Reads the clock once per request to say how many days a subscription has
 * left; there is no client render to replay. */
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { getProContext } from "@/lib/shops/proContext";
import { quotaStatus } from "@/lib/shops/server";
import { shopsGate } from "@/lib/shops/public";
import { isShopVerified } from "@/lib/shops/format";
import type { ListingType } from "@/lib/publication";
import { AlertTriangle, BadgeCheck, CalendarClock, Eye, Megaphone, Plus } from "lucide-react";

/**
 * Résumé — where the shop stands: its subscription and when it ends, how much
 * of its quota is live, whether it is verified, and anything that needs doing.
 * Every number comes from the same functions that enforce them
 * (`listing_quota_status`, `shop_current_subscription`, 0188–0189).
 */
export default async function ProSummaryPage() {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null; // the layout already answered
  const { admin, user, shop } = ctx;

  const [quota, subRes, countRes, gate] = await Promise.all([
    quotaStatus(admin, user.id, shop.id, shop.activity_type as ListingType),
    admin
      .from("subscriptions")
      .select("starts_at, ends_at, grace_ends_at, status, reason, product:products (name_fr, name_ar)")
      .eq("shop_id", shop.id)
      .neq("status", "cancelled")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("listings").select("status").eq("shop_id", shop.id),
    shopsGate(admin),
  ]);

  const locale = await getLocale();
  const t = await getTranslations("pro.summary");
  const tb = await getTranslations("pro.bucket");
  type Product = { name_fr: string; name_ar: string | null };
  const sub = subRes.data as
    | { starts_at: string; ends_at: string; grace_ends_at: string; status: string; reason: string | null;
        product: Product | Product[] | null }
    | null;
  const product = sub ? (Array.isArray(sub.product) ? sub.product[0] : sub.product) : null;
  const planName = sub ? (locale === "ar" && product?.name_ar ? product.name_ar : product?.name_fr) ?? "—" : null;
  const now = Date.now();
  const daysLeft = sub ? Math.ceil((new Date(sub.ends_at).getTime() - now) / 86_400_000) : null;
  const current = sub != null && daysLeft != null && daysLeft > 0;
  const inGrace = sub != null && !current && new Date(sub.grace_ends_at).getTime() > now;

  const counts: Record<string, number> = {};
  for (const r of countRes.data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  const bucketWord = tb(quota.bucket === "parts" ? "parts" : "vehicles");
  const pct = quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  const date = (iso: string) => formatDate(iso, locale);

  // What needs doing, most urgent first.
  const alerts: { tone: "bad" | "warn"; text: string; href?: string; cta?: string }[] = [];
  if (shop.status === "suspended") {
    // The reason is the admin's own words, shown as written.
    alerts.push({ tone: "bad", text: shop.rejection_reason ? t("alerts.suspendedBecause", { reason: shop.rejection_reason }) : t("alerts.suspended") });
  } else if (shop.status === "draft") {
    alerts.push({ tone: "warn", text: t("alerts.draft"), href: "/pro/dashboard/abonnement", cta: t("cta.choose") });
  } else if (shop.status !== "active") {
    alerts.push({ tone: "warn", text: t("alerts.pending") });
  }
  // A draft has never had a period; the line above already says what to do.
  if (!current && !inGrace && shop.status !== "draft") {
    alerts.push({ tone: "bad", text: t("alerts.noSubscription"), href: "/pro/dashboard/abonnement", cta: t("cta.choosePlan") });
  } else if (inGrace) {
    alerts.push({ tone: "bad", text: t("alerts.grace", { ended: date(sub!.ends_at), grace: date(sub!.grace_ends_at) }), href: "/pro/dashboard/abonnement", cta: t("cta.renew") });
  } else if (daysLeft != null && daysLeft <= 14) {
    alerts.push({ tone: "warn", text: t("alerts.endsSoon", { days: daysLeft, date: date(sub!.ends_at) }), href: "/pro/dashboard/abonnement", cta: t("cta.renew") });
  }
  if (quota.limit > 0 && quota.remaining === 0) {
    alerts.push({ tone: "warn", text: t("alerts.quotaFull", { count: quota.limit, bucket: bucketWord }), href: "/pro/dashboard/annonces", cta: t("cta.manage") });
  }
  const missing = [
    !shop.logo_path && t("alerts.missingLogo"),
    !shop.description && t("alerts.missingDescription"),
    !shop.phone && !shop.whatsapp && t("alerts.missingPhone"),
  ].filter(Boolean);
  if (missing.length > 0) {
    alerts.push({ tone: "warn", text: t("alerts.missing", { items: missing.join(locale === "ar" ? "، " : ", ") }), href: "/pro/dashboard/boutique", cta: t("cta.complete") });
  }
  if (counts.rejected) {
    alerts.push({ tone: "warn", text: t("alerts.rejected", { count: counts.rejected }), href: "/pro/dashboard/annonces", cta: t("cta.see") });
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li
              key={i}
              className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed ${
                a.tone === "bad" ? "batta-tone-bad" : "batta-tone-warn"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{a.text}</span>
              {a.href && (
                <Link href={a.href as never} className="shrink-0 font-bold underline">
                  {a.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <Megaphone className="size-3.5" /> {t("online")}
          </h2>
          <p className="batta-tabular mt-2 text-[28px] font-black">
            {quota.used}
            <span className="text-[16px] font-bold text-muted"> / {quota.limit} {bucketWord}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            {t("onlineHint")}
          </p>
          <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target mt-3 inline-flex px-3.5 py-2 text-[12.5px]">
            <Plus className="size-4" /> {t("newListing")}
          </Link>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <CalendarClock className="size-3.5" /> {t("subscription")}
          </h2>
          {sub ? (
            <>
              <p className="mt-2 text-[20px] font-black">{planName}</p>
              <p className="mt-1 text-[12.5px] text-muted">
                {current
                  ? t("until", { days: daysLeft!, date: date(sub.ends_at) })
                  : t("ended", { date: date(sub.ends_at) })}
              </p>
              {sub.reason === "migration" && (
                <p className="mt-1 text-[11.5px] text-muted">{t("gift")}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">{t("noSubscription")}</p>
          )}
          <Link href={"/pro/dashboard/abonnement" as never} className="mt-2 inline-block text-[12px] font-bold text-gold hover:underline">
            {t("manageSubscription")}
          </Link>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <BadgeCheck className="size-3.5" /> {t("verification")}
          </h2>
          <p className="mt-2 text-[14px] font-bold">
            {isShopVerified(shop)
              ? t("verified")
              : shop.verification_status === "pending"
                ? t("verificationPending")
                : shop.verification_status === "rejected"
                  ? t("verificationRejected")
                  : t("notVerified")}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {t("verificationHint")}
          </p>
          {!isShopVerified(shop) && shop.verification_status !== "pending" && (
            <Link href={"/pro/dashboard/boutique#justificatifs" as never} className="mt-2 inline-block text-[12.5px] font-bold text-gold hover:underline">
              {t("sendDocuments")}
            </Link>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">
            <Eye className="size-3.5" /> {t("yourPage")}
          </h2>
          <p className="mt-2 text-[14px] font-bold">
            {gate.enabled ? t("public") : t("notPublic")}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {gate.enabled ? t("publicHint") : t("notPublicHint")}
          </p>
          {shop.status === "active" && (
            <Link href={`/boutiques/${shop.slug}` as never} className="mt-2 inline-block text-[12.5px] font-bold text-gold hover:underline">
              {t("viewPage")}
            </Link>
          )}
        </section>
      </div>

      <p className="text-[11.5px] text-muted">
        {t("countPublished", { count: counts.published ?? 0 })} · {t("countReview", { count: counts.pending_review ?? 0 })} ·{" "}
        {t("countDrafts", { count: counts.draft ?? 0 })} · {t("countExpired", { count: counts.expired ?? 0 })}
      </p>
    </div>
  );
}
