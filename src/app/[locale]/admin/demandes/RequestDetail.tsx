"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import { currencyLabel, formatTND } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { isolated } from "@/lib/shops/approvals";
import { StatusPill, Confirm, useAdminAction, EYEBROW, statusLabel } from "@/components/admin/kit";
import { BadgeCheck, Check, ChevronLeft, ExternalLink, Undo2, X } from "lucide-react";

/**
 * The right pane: one request and what it takes to answer it — who asks, for
 * which shop, what that shop is (activity, papers, current plan), what it
 * asked before, and the payment once there is one. Accept, refuse with a
 * reason, or take an acceptance back before it is paid.
 */

export type RequestDetailData = {
  id: string;
  kind: string;
  status: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  product: { name: string; price: number; days: number | null; limit: { n: number; bucket: string } | null };
  listing: { id: string; title: string; status: string } | null;
  shop: {
    id: string; name: string; slug: string; activity: string; place: string; status: string; verification: string;
    createdAt: string; legal: string | null; documents: Record<string, number>;
    period: { plan: string; endsAt: string } | null;
  };
  requester: { name: string; phone: string | null } | null;
  owner: { name: string; phone: string | null } | null;
  ownerId: string;
  payments: { id: string; amount: number; status: string; provider: string; createdAt: string }[];
  history: { id: string; kind: string; status: string; reason: string | null; createdAt: string; product: string }[];
};

const KINDS = ["opening", "plan_change", "renewal", "boost"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-[5px]">
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-[12.5px] text-foreground">{children}</dd>
    </div>
  );
}

export function RequestDetail({ request, backHref }: { request: RequestDetailData; backHref: string }) {
  const { run, pending } = useAdminAction();
  const t = useTranslations("adminOps");
  const locale = useLocale();
  const [confirm, setConfirm] = useState<null | "reject" | "revoke">(null);
  const r = request;
  const dt = (iso: string | null) =>
    iso ? formatDate(iso, locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const kind = (k: string) => (KINDS.includes(k) ? t(`requests.kind.${k}`) : k);
  const money = (n: number) => `${formatTND(n, locale)} ${currencyLabel(locale)}`;
  const decide = (decision: string, success: string, reason?: string) =>
    run({ url: `/api/admin/demandes/${r.id}`, method: "POST", body: { decision, reason }, success });
  const docs = Object.entries(r.shop.documents);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-5 py-3.5">
        <Link href={backHref as "/admin/demandes"} className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-subtle transition hover:text-foreground lg:hidden">
          <ChevronLeft className="size-3.5 rtl:rotate-180" strokeWidth={2.4} />
          {t("requests.back")}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-[16px] font-semibold tracking-tight text-foreground">
            {kind(r.kind)} · {r.product.name}
          </h1>
          <StatusPill status={r.status} />
        </div>
        <p className="mt-1 text-[11.5px] text-subtle">
          {t("requests.askedOn", { date: dt(r.createdAt) })}
          {r.decidedAt && <> · {t("requests.decidedOn", { date: dt(r.decidedAt), who: r.decidedBy ?? t("shops.system") })}</>}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {r.reason && (
          <p className="mb-3 border-s-2 border-[var(--tone-bad)] ps-3 text-[12.5px] text-[var(--tone-bad)]">
            <span className="font-semibold">{t("shop.reasonGiven")}</span> {isolated(r.reason)}
          </p>
        )}

        <section>
          <h2 className={EYEBROW}>{t("requests.what")}</h2>
          <dl className="mt-2">
            <Row label={t("requests.offer")}>{r.product.name} · <span className="batta-tabular">{money(r.product.price)}</span></Row>
            {r.product.limit && (
              <Row label={t("requests.gives")}>
                {t("requests.limit", { count: r.product.limit.n, bucket: t(`requests.bucket.${r.product.limit.bucket}`), days: r.product.days ?? 0 })}
              </Row>
            )}
            {r.listing && (
              <Row label={t("requests.listing")}>
                <a href={`/${locale}/annonces/${r.listing.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-[var(--gold)] hover:underline">
                  {r.listing.title} <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
                </a>
                <span className="text-subtle"> · {statusLabel(r.listing.status, locale)}</span>
              </Row>
            )}
            {r.owner && r.requester && (
              <Row label={t("requests.requester")}>
                {r.requester.name}
                {r.requester.phone && <span className="text-subtle"> · <span className="ltr-island">{r.requester.phone}</span></span>}
              </Row>
            )}
          </dl>
        </section>

        <section className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className={EYEBROW}>{t("requests.shop")}</h2>
            <Link href={`/admin/boutiques?a=${r.shop.id}` as "/admin/boutiques"} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] hover:underline">
              {t("requests.openShop")} <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
            </Link>
          </div>
          <dl className="mt-2">
            <Row label={t("requests.shopName")}>{r.shop.name}</Row>
            <Row label={t("shop.owner")}>
              <Link href={`/admin/vendeurs?a=${r.ownerId}` as "/admin/vendeurs"} className="font-medium text-[var(--gold)] hover:underline">
                {(r.owner ?? r.requester)?.name ?? "—"}
              </Link>
              {(r.owner ?? r.requester)?.phone && (
                <span className="text-subtle"> · <span className="ltr-island">{(r.owner ?? r.requester)!.phone}</span></span>
              )}
            </Row>
            <Row label={t("requests.activity")}>{r.shop.activity} · {r.shop.place}</Row>
            <Row label={t("requests.shopStatus")}>
              <StatusPill status={r.shop.status} />
              {r.shop.verification === "verified" && (
                <span className="ms-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--gold)]">
                  <BadgeCheck className="size-3.5" strokeWidth={2.4} /> {t("shop.verified")}
                </span>
              )}
            </Row>
            <Row label={t("shop.legal")}>{r.shop.legal ?? <span className="text-subtle">{t("shop.legalEmpty")}</span>}</Row>
            <Row label={t("shop.documents")}>
              {docs.length === 0
                ? <span className="text-subtle">{t("shop.noDocuments")}</span>
                : docs.map(([s, n]) => `${statusLabel(s, locale)} ${n}`).join(" · ")}
            </Row>
            <Row label={t("shop.subscription")}>
              {r.shop.period
                ? t("requests.periodUntil", { plan: r.shop.period.plan, date: dt(r.shop.period.endsAt) })
                : <span className="text-subtle">{t("shop.noPeriod")}</span>}
            </Row>
            <Row label={t("requests.since")}>{dt(r.shop.createdAt)}</Row>
          </dl>
        </section>

        {r.payments.length > 0 && (
          <section className="mt-5 border-t border-border pt-4">
            <h2 className={EYEBROW}>{t("shop.payments")}</h2>
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {r.payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/paiements?a=${p.id}` as "/admin/paiements"} className="flex flex-wrap items-center gap-x-3 py-1.5 hover:text-[var(--gold)]">
                    <span className="batta-tabular">{money(p.amount)}</span>
                    <StatusPill status={p.status} />
                    <span className="text-[11.5px] text-subtle">{p.provider === "konnect" ? t("shop.viaKonnect") : t("shop.viaTransfer")} · {dt(p.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-5 border-t border-border pt-4">
          <h2 className={EYEBROW}>{t("requests.before")}</h2>
          {r.history.length === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("requests.firstRequest")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/70 text-[12.5px]">
              {r.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
                  <Link href={`/admin/demandes?status=all&a=${h.id}` as "/admin/demandes"} className="font-medium hover:text-[var(--gold)]">
                    {kind(h.kind)} · {h.product}
                  </Link>
                  <StatusPill status={h.status} />
                  <span className="text-[11.5px] text-subtle">{dt(h.createdAt)}</span>
                  {h.reason && <span className="w-full text-[11.5px] text-subtle">« {isolated(h.reason)} »</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(r.status === "pending" || r.status === "approved") && (
        <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-5 py-3">
          {r.status === "pending" ? (
            <>
              <AdminButton
                variant="primary"
                pending={pending}
                icon={<Check className="size-3.5" strokeWidth={2.4} />}
                onClick={() => decide("approve", t("requests.approved"))}
              >
                {t("requests.approve")}
              </AdminButton>
              <AdminButton variant="quiet" icon={<X className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("reject")}>
                {t("requests.reject")}
              </AdminButton>
            </>
          ) : (
            <>
              <p className="me-auto text-[12px] text-subtle">{t("requests.waitingPayment")}</p>
              <AdminButton variant="quiet" icon={<Undo2 className="size-3.5" strokeWidth={2.4} />} onClick={() => setConfirm("revoke")}>
                {t("requests.revoke")}
              </AdminButton>
            </>
          )}
        </footer>
      )}

      <Confirm
        open={confirm === "reject"}
        title={t("requests.rejectTitle")}
        body={r.kind === "opening" ? t("requests.rejectOpeningBody") : t("requests.rejectBody")}
        confirmLabel={t("requests.reject")}
        pending={pending}
        reason={{ label: t("common.reasonForSeller"), placeholder: t("requests.rejectPlaceholder"), required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (reason) => {
          if (await decide("reject", t("requests.rejected"), reason)) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "revoke"}
        title={t("requests.revokeTitle")}
        body={t("requests.revokeBody")}
        confirmLabel={t("requests.revoke")}
        pending={pending}
        reason={{ label: t("common.reasonForSeller"), placeholder: t("requests.rejectPlaceholder"), required: true }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (reason) => {
          if (await decide("revoke", t("requests.revoked"), reason)) setConfirm(null);
        }}
      />
    </div>
  );
}
