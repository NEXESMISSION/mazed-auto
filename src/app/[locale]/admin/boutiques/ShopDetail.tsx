"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { currencyLabel } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  StatusPill, Confirm, SelectField, NumberField, TextareaField, FieldGrid,
  useAdminAction, EYEBROW, statusLabel, paymentKindLabel,
} from "@/components/admin/kit";
import {
  BadgeCheck, Ban, ChevronLeft, ExternalLink, FileText, Gift, RotateCcw, ShieldX, Store,
} from "lucide-react";

/**
 * The right pane: one shop — who runs it, its papers, its periods and
 * payments, its annonces, and everything decided about it. The four levers are
 * at the bottom (verify, refuse the verification, suspend, open); papers are
 * reviewed in place; a period can be given with a reason.
 */

export type ShopDetailData = {
  id: string; name: string; slug: string; activity: string; description: string | null;
  place: string; phone: string | null; whatsapp: string | null;
  status: string; verification: string; verifiedAt: string | null; rejectionReason: string | null;
  createdAt: string;
  owner: { id: string; name: string; phone: string | null };
  legal: { name: string | null; taxId: string | null; rne: string | null; address: string | null; email: string | null } | null;
  documents: { id: string; kind: string; status: string; note: string | null; createdAt: string }[];
  periods: { id: string; plan: string; startsAt: string; endsAt: string; graceEndsAt: string; status: string; origin: string }[];
  payments: { id: string; kind: string; amount: number; status: string; provider: string; createdAt: string; receipt: string | null }[];
  listings: Record<string, number>;
  plans: { code: string; label: string }[];
  audit: {
    id: string; at: string; entity: string; action: string; actor: string;
    before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null;
  }[];
};

const DOC_KINDS = ["rne", "patente", "cin_gerant", "autre"];

type Tr = ReturnType<typeof useTranslations>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-[5px]">
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-[12.5px] text-foreground">{children}</dd>
    </div>
  );
}

/** One line of the trail, in words. */
function describe(a: ShopDetailData["audit"][number], t: Tr, dt: (iso: string | null) => string, locale: string): string {
  const b = a.before ?? {};
  const n = a.after ?? {};
  const label = (v: unknown) => statusLabel(String(v), locale);
  // The arrow follows the reading direction: « avant → après », « بعد ← قبل ».
  const arrow = locale === "ar" ? "←" : "→";
  const change = (k: string) => (b[k] !== undefined && b[k] !== n[k] ? `${label(b[k])} ${arrow} ${label(n[k])}` : null);
  if (a.entity === "shop") {
    if (a.action === "created") return t("shop.trail.shopCreated");
    const status = change("status");
    const verification = change("verification_status");
    const parts = [
      status && t("shop.trail.status", { change: status }),
      verification && t("shop.trail.verification", { change: verification }),
    ].filter(Boolean);
    return parts.join(" · ") || t("shop.trail.shopEdited");
  }
  if (a.entity === "subscription") {
    if (a.action === "created") {
      const paid = Boolean(n.payment_id);
      return typeof n.ends_at === "string"
        ? t(paid ? "shop.trail.periodPaidUntil" : "shop.trail.periodOfferedUntil", { date: dt(n.ends_at) })
        : t(paid ? "shop.trail.periodPaid" : "shop.trail.periodOffered");
    }
    return t("shop.trail.period", { change: change("status") ?? t("shop.trail.edited") });
  }
  if (a.entity === "shop_document") {
    const kind = DOC_KINDS.includes(String(n.kind)) ? t(`shop.docKind.${String(n.kind)}`) : t("shop.docGeneric");
    return a.action === "submitted"
      ? t("shop.trail.docSent", { kind })
      : t("shop.trail.docStatus", { kind, status: label(n.status) });
  }
  if (a.entity === "listing") {
    const what = change("status") ?? t("shop.trail.edited");
    return n.paused_reason
      ? t("shop.trail.listingWhy", { change: what, why: String(n.paused_reason).replace("_", " ") })
      : t("shop.trail.listing", { change: what });
  }
  return `${a.entity} · ${a.action}`;
}

export function ShopDetail({ shop, backHref }: { shop: ShopDetailData; backHref: string }) {
  const { run, pending } = useAdminAction();
  const t = useTranslations("adminOps");
  const locale = useLocale();
  const dt = (iso: string | null) =>
    iso ? formatDate(iso, locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const dtt = (iso: string) =>
    formatDate(iso, locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const docKind = (k: string) => (DOC_KINDS.includes(k) ? t(`shop.docKind.${k}`) : k);
  const [confirm, setConfirm] = useState<null | "suspend" | "reject" | { doc: string }>(null);
  const [granting, setGranting] = useState(false);
  const [plan, setPlan] = useState(shop.plans[0]?.code ?? "");
  const [days, setDays] = useState<number | null>(30);
  const [reason, setReason] = useState("");

  const s = shop;
  const act = (body: Record<string, unknown>, success: string) =>
    run({ url: `/api/admin/boutiques/${s.id}`, method: "POST", body, success });
  const live = (s.listings.published ?? 0) + (s.listings.pending_review ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-5 py-3.5">
        <Link href={backHref as "/admin/boutiques"} className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-subtle transition hover:text-foreground lg:hidden">
          <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={2.4} />
          {t("shop.back")}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-[16px] font-semibold tracking-tight text-foreground">{s.name}</h1>
          <StatusPill status={s.status} />
          {s.verification === "verified" ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--gold)]">
              <BadgeCheck className="size-3.5" strokeWidth={2.4} /> {t("shop.verified")}
            </span>
          ) : (
            <StatusPill status={s.verification === "pending" ? "submitted" : s.verification} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
          <span>{s.activity}</span>
          <span>{s.place}</span>
          <span>{t("shop.created", { date: dt(s.createdAt) })}</span>
          <a href={`/${locale}/boutiques/${s.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-[var(--gold)] hover:underline">
            {t("shop.storefront")} <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
          </a>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {s.rejectionReason && ["rejected", "suspended"].some((x) => x === s.status || x === s.verification) && (
          <p className="mb-3 border-s-2 border-[var(--tone-bad)] ps-3 text-[12.5px] text-[var(--tone-bad)]">
            <span className="font-semibold">{t("shop.reasonGiven")}</span> {s.rejectionReason}
          </p>
        )}

        <section>
          <h2 className={EYEBROW}>{t("shop.ownerSection")}</h2>
          <dl className="mt-2">
            <Row label={t("shop.owner")}>
              <Link href={`/admin/vendeurs?a=${s.owner.id}` as "/admin/vendeurs"} className="font-medium text-[var(--gold)] hover:underline">
                {s.owner.name}
              </Link>
              {s.owner.phone && <span className="text-subtle"> · <span className="ltr-island">{s.owner.phone}</span></span>}
            </Row>
            <Row label={t("shop.shopPhone")}>{s.phone ? <span className="ltr-island">{s.phone}</span> : <span className="text-subtle">{t("shop.notGiven")}</span>}</Row>
            <Row label={t("shop.whatsapp")}>{s.whatsapp ? <span className="ltr-island">{s.whatsapp}</span> : <span className="text-subtle">—</span>}</Row>
            {s.description && <Row label={t("shop.presentation")}><span className="line-clamp-3">{s.description}</span></Row>}
          </dl>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("shop.legal")}</h2>
          {s.legal && Object.values(s.legal).some(Boolean) ? (
            <dl className="mt-2">
              <Row label={t("shop.legalName")}>{s.legal.name ?? "—"}</Row>
              <Row label={t("shop.taxId")}>{s.legal.taxId ? <span className="ltr-island">{s.legal.taxId}</span> : "—"}</Row>
              <Row label={t("shop.rne")}>{s.legal.rne ? <span className="ltr-island">{s.legal.rne}</span> : "—"}</Row>
              <Row label={t("shop.legalAddress")}>{s.legal.address ?? "—"}</Row>
              <Row label={t("shop.email")}>{s.legal.email ? <span className="ltr-island">{s.legal.email}</span> : "—"}</Row>
            </dl>
          ) : (
            <p className="mt-2 text-[12px] text-subtle">{t("shop.legalEmpty")}</p>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("shop.documents")}</h2>
          {s.documents.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("shop.noDocuments")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70">
              {s.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-[12.5px]">
                  <FileText className="size-3.5 shrink-0 text-subtle" />
                  <span className="font-medium text-foreground">{docKind(d.kind)}</span>
                  <StatusPill status={d.status} />
                  <span className="text-[11.5px] text-subtle">{dt(d.createdAt)}</span>
                  <a
                    href={`/api/admin/boutiques/${s.id}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] hover:underline"
                  >
                    {t("common.open")} <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
                  </a>
                  {d.status === "submitted" && (
                    <span className="ms-auto flex gap-1.5">
                      <AdminButton size="sm" pending={pending} onClick={() => act({ action: "review_document", document_id: d.id, status: "accepted" }, t("shop.docAccepted"))}>
                        {t("shop.accept")}
                      </AdminButton>
                      <AdminButton size="sm" variant="quiet" onClick={() => setConfirm({ doc: d.id })}>
                        {t("shop.refuse")}
                      </AdminButton>
                    </span>
                  )}
                  {d.note && <p className="w-full text-[11.5px] text-subtle">{t("shop.docReason", { note: d.note })}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-subtle">{t("shop.docLinkNote")}</p>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className={EYEBROW}>{t("shop.subscription")}</h2>
            <AdminButton size="sm" icon={<Gift className="size-3.5" strokeWidth={2.4} />} onClick={() => setGranting(!granting)}>
              {t("shop.grantPeriod")}
            </AdminButton>
          </div>
          {granting && (
            <div className="mt-3 space-y-3.5 border-s-2 border-[var(--gold)] ps-4">
              <p className="text-[11.5px] text-subtle">
                {t("shop.grantBody")}
              </p>
              <FieldGrid>
                <SelectField label={t("shop.plan")} value={plan} onChange={setPlan} options={s.plans.map((p) => ({ value: p.code, label: p.label }))} />
                <NumberField label={t("shop.duration")} value={days} onChange={setDays} min={1} suffix={t("common.days")} />
              </FieldGrid>
              <TextareaField label={t("shop.reason")} value={reason} onChange={setReason} rows={2} />
              <div className="flex justify-end gap-2">
                <AdminButton variant="quiet" onClick={() => setGranting(false)}>{t("common.cancel")}</AdminButton>
                <AdminButton
                  variant="primary"
                  pending={pending}
                  disabled={!plan || !days || !reason.trim()}
                  disabledReason={t("shop.grantMissing")}
                  onClick={async () => {
                    if (await act({ action: "grant_period", plan_code: plan, days, reason }, t("shop.periodGranted"))) {
                      setGranting(false);
                      setReason("");
                    }
                  }}
                >
                  {t("shop.offer")}
                </AdminButton>
              </div>
            </div>
          )}
          {s.periods.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("shop.noPeriod")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {s.periods.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                  <span className="font-medium text-foreground">{p.plan}</span>
                  <span className="text-subtle">{dt(p.startsAt)} → {dt(p.endsAt)}</span>
                  <StatusPill status={p.status === "grace" ? "pending" : p.status === "active" ? "active" : "expired"}>
                    {["grace", "active", "expired"].includes(p.status) ? t(`shop.periodStatus.${p.status}`) : p.status}
                  </StatusPill>
                  <span className="ms-auto text-[11.5px] text-subtle">{p.origin}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("shop.payments")}</h2>
          {s.payments.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("shop.noPayments")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {s.payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/paiements?a=${p.id}` as "/admin/paiements"} className="flex flex-wrap items-center gap-x-3 py-1.5 hover:text-[var(--gold)]">
                    <span className="font-medium">{paymentKindLabel(p.kind, locale)}</span>
                    <span className="batta-tabular">{p.amount.toFixed(3)} {currencyLabel(locale)}</span>
                    <StatusPill status={p.status} />
                    <span className="text-[11.5px] text-subtle">{p.provider === "konnect" ? t("shop.viaKonnect") : t("shop.viaTransfer")} · {dt(p.createdAt)}</span>
                    {p.receipt && <span className="ltr-island ltr:ml-auto rtl:mr-auto text-[11.5px] text-subtle">{p.receipt}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("shop.listings")}</h2>
          <p className="mt-2 text-[12.5px]">
            <Link href={`/admin/annonces?status=all&q=${encodeURIComponent(s.owner.phone ?? s.name)}` as "/admin/annonces"} className="inline-flex items-center gap-1.5 font-medium text-[var(--gold)] hover:underline">
              {t("shop.listingsValue", { live, total: Object.values(s.listings).reduce((a, b) => a + b, 0) })}
              <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
            </Link>
          </p>
          {Object.keys(s.listings).length > 0 && (
            <p className="mt-1 text-[11.5px] text-subtle">
              {Object.entries(s.listings).map(([k, v]) => `${statusLabel(k, locale)} ${v}`).join(" · ")}
            </p>
          )}
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("shop.history")}</h2>
          {s.audit.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("shop.historyEmpty")}</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {s.audit.map((a) => (
                <li key={a.id} className="grid grid-cols-[96px_1fr] gap-3 text-[12px]">
                  <span className="text-[11px] text-subtle">{dtt(a.at)}</span>
                  <span className="min-w-0">
                    <span className="text-foreground">{describe(a, t, dt, locale)}</span>
                    <span className="text-subtle"> — {a.actor}</span>
                    {a.reason && <span className="block text-[11.5px] text-subtle">« {a.reason} »</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-5 py-3">
        {s.verification !== "verified" && (
          <AdminButton
            icon={<BadgeCheck className="size-3.5" strokeWidth={2.4} />}
            pending={pending}
            onClick={() => act({ action: "verify" }, t("shop.verifiedToast"))}
          >
            {t("shop.verify")}
          </AdminButton>
        )}
        {s.verification !== "rejected" && s.verification !== "unverified" && (
          <AdminButton variant="quiet" icon={<ShieldX className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("reject")}>
            {s.verification === "verified" ? t("shop.removeVerification") : t("shop.refuseVerification")}
          </AdminButton>
        )}
        {s.status === "active" ? (
          <AdminButton variant="quiet" className="ms-auto" icon={<Ban className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("suspend")}>
            {t("shop.suspend")}
          </AdminButton>
        ) : s.status !== "closed" ? (
          <AdminButton
            variant="quiet"
            className="ms-auto"
            pending={pending}
            icon={s.status === "suspended" ? <RotateCcw className="size-3.5" strokeWidth={2.4} /> : <Store className="size-3.5" strokeWidth={2.4} />}
            onClick={() => act({ action: "activate" }, t("shop.activated"))}
          >
            {s.status === "suspended" ? t("shop.reactivate") : t("shop.openShop")}
          </AdminButton>
        ) : null}
      </footer>

      <Confirm
        open={confirm === "suspend"}
        title={t("shop.suspendTitle")}
        body={t("shop.suspendBody")}
        confirmLabel={t("shop.suspend")}
        pending={pending}
        reason={{ label: t("common.reasonForOwner"), placeholder: t("shop.suspendPlaceholder"), required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (await act({ action: "suspend", reason: r }, t("shop.suspended"))) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "reject"}
        title={s.verification === "verified" ? t("shop.removeBadgeTitle") : t("shop.refuseTitle")}
        body={t("shop.verificationBody")}
        confirmLabel={s.verification === "verified" ? t("shop.remove") : t("shop.refuse")}
        pending={pending}
        reason={{ label: t("common.reasonForOwner"), placeholder: t("shop.verificationPlaceholder"), required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (await act({ action: "reject_verification", reason: r }, t("shop.verificationRefused"))) setConfirm(null);
        }}
      />
      <Confirm
        open={typeof confirm === "object" && confirm !== null}
        title={t("shop.docRefuseTitle")}
        body={t("shop.docRefuseBody")}
        confirmLabel={t("shop.refuse")}
        pending={pending}
        reason={{ label: t("common.reasonForOwner"), placeholder: t("shop.docRefusePlaceholder"), required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (r) => {
          if (typeof confirm === "object" && confirm !== null) {
            if (await act({ action: "review_document", document_id: confirm.doc, status: "rejected", note: r }, t("shop.docRefused"))) setConfirm(null);
          }
        }}
      />
    </div>
  );
}
