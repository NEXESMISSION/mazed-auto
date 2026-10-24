"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ListingImage } from "@/components/media/ListingImage";
import { DiagnosticEditor } from "@/components/admin/DiagnosticEditor";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  StatusPill, Confirm, TextField, TextareaField, NumberField,
  ToggleField, FieldGrid, useAdminAction, paymentKindLabel, EYEBROW,
} from "@/components/admin/kit";
import { currencyLabel, formatTND } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { Diagnostic } from "@/lib/diagnostics";
import { parseRejection } from "@/lib/rejection";
import {
  Check, X, Archive, Trash2, Star, StarOff, CalendarPlus, BadgeCheck,
  Pencil, RotateCcw, ExternalLink, ImageOff, ChevronLeft,
} from "lucide-react";

/**
 * The right pane: one annonce, everything about it, and everything you can do
 * to it.
 *
 * It is a pane, not a drawer. A drawer covers the list it came from, so every
 * decision costs an open and a close; a permanent second pane means the queue
 * stays visible and moderating twenty annonces is twenty clicks rather than
 * forty. Below `lg` there is not room for two panes, so the list hands over to
 * this full-width and a back link returns.
 *
 * The action bar is pinned to the bottom of the pane rather than sitting after
 * the content: the whole point of the split is that the decision is always
 * within reach, however long the description runs.
 */

export type PanelPhoto = { path: string; isCover: boolean };

export type PanelListing = {
  id: string;
  reference: string | null;
  title: string;
  description: string | null;
  price: number | null;
  negotiable: boolean;
  priceOnRequest: boolean;
  condition: string | null;
  governorate: string;
  delegation: string | null;
  status: string;
  rejectionReason: string | null;
  categoryLabel: string;
  categoryKind: string;
  sellerName: string;
  sellerPhone: string | null;
  /** The shop it is published under; null for a personal annonce. */
  shopName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  showPhone: boolean;
  /** Resolved server-side against `category_attributes`, so labels are real. */
  attributes: { label: string; value: string }[];
  photos: PanelPhoto[];
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  featuredUntil: string | null;
  viewCount: number;
  contactRevealCount: number;
  renewedCount: number;
  attestation: { version: string; at: string | null } | null;
  payment: { amount: number; status: string; kind: string; uploadedAt: string | null } | null;
  paidWith: "credit" | "payment" | "waived" | "subscription" | "free" | "none";
  diagnostic: Diagnostic | null;
};

/** « 24 oct. 2026 » in the console's language, "—" when there is no date. */
function useShortDate() {
  const locale = useLocale();
  return (iso: string | null) =>
    iso ? formatDate(iso, locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

/** label / value line. No borders — the label column carries the structure. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-[5px]">
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-[12.5px] text-foreground">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className={EYEBROW}>{title}</h3>
      <dl className="mt-2">{children}</dl>
    </section>
  );
}

export function ListingDetail({
  listing,
  backHref,
}: {
  listing: PanelListing;
  /** Where the mobile back link goes — the list, with its filters intact. */
  backHref: string;
}) {
  const { run, pending } = useAdminAction();
  const t = useTranslations("adminOps");
  const locale = useLocale();
  const dt = useShortDate();
  const [confirm, setConfirm] = useState<null | "reject" | "delete" | "archive" | "sold">(null);
  const [editing, setEditing] = useState(false);

  const l = listing;
  const featured = Boolean(l.featuredUntil && new Date(l.featuredUntil) > new Date());
  const feeUnsettled =
    l.status === "pending_payment" || (l.status === "pending_review" && l.paidWith === "none");

  const act = (body: Record<string, unknown>, success: string) =>
    run({ url: `/api/admin/annonces/${l.id}`, method: "POST", body, success });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Head */}
      <header className="shrink-0 border-b border-border px-5 py-3.5">
        <Link
          href={backHref as "/admin/annonces"}
          className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-subtle transition hover:text-foreground lg:hidden"
        >
          <ChevronLeft className="size-3.5 rtl:-scale-x-100" strokeWidth={2.4} />
          {t("common.queue")}
        </Link>
        <h1 className="truncate text-[16px] font-semibold tracking-tight text-foreground">
          {l.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
          <StatusPill status={l.status} />
          {/* The code the seller on the phone will have quoted. */}
          {l.reference && (
            <span className="batta-tabular ltr-island font-semibold text-foreground/70">{l.reference}</span>
          )}
          {featured && (
            <span className="inline-flex items-center gap-1 text-[var(--gold)]">
              <Star className="size-3" strokeWidth={2.6} /> {t("listing.home")}
            </span>
          )}
          <span>{l.categoryLabel}</span>
          <span>
            {l.governorate}
            {l.delegation ? ` · ${l.delegation}` : ""}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {l.photos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {l.photos.map((p, i) => (
              <div
                key={`${p.path}-${i}`}
                className="relative aspect-[4/3] w-[150px] shrink-0 overflow-hidden bg-surface-2"
              >
                <ListingImage path={p.path} alt={t("listing.photoAlt", { n: i + 1 })} sizes="150px" />
                {p.isCover && (
                  <span className="absolute start-1 top-1 bg-black/70 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--gold)]">
                    {t("listing.cover")}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-dashed border-border px-4 py-5 text-[12px] text-subtle">
            <ImageOff className="size-4" strokeWidth={2} />
            {t("listing.noPhoto")}
          </div>
        )}

        {l.rejectionReason && (
          <p className="mt-4 border-s-2 border-[var(--tone-bad)] ps-3 text-[12.5px] text-[var(--tone-bad)]">
            <span className="font-semibold">{t("listing.rejectionReason")}</span>{" "}
            {(() => {
              // A tagged motif ("[PHOTOS] …") reads as its category, in the
              // console's language, then the text the admin typed.
              const r = parseRejection(l.rejectionReason, locale);
              return r.tagged ? `${r.label} — ${r.message}` : r.message;
            })()}
          </p>
        )}

        {editing && <EditForm listing={l} onDone={() => setEditing(false)} />}

        <div className="mt-5 space-y-4">
          <Group title={t("listing.groups.listing")}>
            <Row label={t("listing.rows.price")}>
              {l.priceOnRequest
                ? t("annonces.onRequest")
                : l.price != null
                  ? `${formatTND(l.price, locale)} ${currencyLabel(locale)}${l.negotiable ? t("listing.negotiable") : ""}`
                  : "—"}
            </Row>
            {/* The raw enum was going straight to screen: the panel read
                "État: used". Same label map the public listing page uses, so
                the console and the site cannot disagree about what a value
                means. Falls back to the raw value rather than hiding it — an
                unlabelled status is a bug report. */}
            {l.condition && (
              <Row label={t("listing.rows.condition")}>
                {["used", "new", "refurbished"].includes(l.condition)
                  ? t(`conditions.${l.condition}`)
                  : l.condition}
              </Row>
            )}
            {l.description && (
              <Row label={t("listing.rows.description")}>
                <span className="whitespace-pre-wrap break-words">{l.description}</span>
              </Row>
            )}
          </Group>

          {l.attributes.length > 0 && (
            <Group title={t("listing.groups.attributes")}>
              {l.attributes.map((a) => (
                <Row key={a.label} label={a.label}>
                  {a.value}
                </Row>
              ))}
            </Group>
          )}

          <Group title={t("listing.groups.seller")}>
            <Row label={t("listing.rows.account")}>{l.sellerName}</Row>
            {l.shopName && <Row label={t("listing.rows.shop")}>{l.shopName}</Row>}
            {l.sellerPhone && (
              <Row label={t("listing.rows.accountPhone")}>
                <span className="ltr-island">{l.sellerPhone}</span>
              </Row>
            )}
            <Row label={t("listing.rows.onListing")}>
              {l.contactPhone ? (
                <>
                  <span className="ltr-island">{l.contactPhone}</span>
                  {l.contactName ? ` · ${l.contactName}` : ""}
                  {!l.showPhone && <span className="text-subtle">{t("listing.hidden")}</span>}
                </>
              ) : (
                <span className="text-[var(--tone-bad)]">{t("listing.noNumber")}</span>
              )}
            </Row>
            {l.attestation && (
              <Row label={t("listing.rows.attestation")}>
                {l.attestation.version === "v1-admin"
                  ? t("listing.attestationAdmin")
                  : t("listing.attestationSeller")}
                {l.attestation.at ? ` · ${dt(l.attestation.at)}` : ""}
              </Row>
            )}
          </Group>

          <Group title={t("listing.groups.publication")}>
            <Row label={t("listing.rows.paidBy")}>{t(`listing.paidWith.${l.paidWith}`)}</Row>
            {l.payment && (
              <Row label={t("listing.rows.payment")}>
                {formatTND(l.payment.amount, locale)} {currencyLabel(locale)} · {paymentKindLabel(l.payment.kind, locale)} ·{" "}
                <StatusPill status={l.payment.status} />
              </Row>
            )}
            <Row label={t("listing.rows.createdAt")}>{dt(l.createdAt)}</Row>
            <Row label={t("listing.rows.publishedAt")}>{dt(l.publishedAt)}</Row>
            <Row label={t("listing.rows.expiresAt")}>{dt(l.expiresAt)}</Row>
            {featured && <Row label={t("listing.rows.featuredUntil")}>{dt(l.featuredUntil)}</Row>}
            <Row label={t("listing.rows.renewals")}>{l.renewedCount}</Row>
            <Row label={t("listing.rows.audience")}>
              {t("listing.audienceValue", { views: l.viewCount, reveals: l.contactRevealCount })}
            </Row>
            {l.status === "published" && (
              <Row label={t("listing.rows.publicPage")}>
                <Link
                  href={`/annonces/${l.id}` as "/annonces"}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 font-medium text-[var(--gold)] hover:underline"
                >
                  {t("common.open")} <ExternalLink className="size-3 rtl:-scale-x-100" strokeWidth={2.2} />
                </Link>
              </Row>
            )}
          </Group>

          <Group title={t("listing.groups.diagnostic")}>
            <div className="mt-1">
              <DiagnosticEditor propertyId={l.id} initial={l.diagnostic} />
            </div>
          </Group>
        </div>
      </div>

      {/* Actions — pinned, so the decision is always in reach. */}
      <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-5 py-3">
        {l.status === "pending_review" && (
          <>
            <AdminButton
              variant="primary"
              pending={pending}
              icon={<Check className="size-3.5" strokeWidth={2.8} />}
              onClick={() => act({ action: "approve" }, t("listing.toasts.published"))}
            >
              {t("listing.actions.publish")}
            </AdminButton>
            <AdminButton
              variant="danger"
              icon={<X className="size-3.5" strokeWidth={2.6} />}
              onClick={() => setConfirm("reject")}
            >
              {t("listing.actions.reject")}
            </AdminButton>
          </>
        )}

        {feeUnsettled && (
          <>
            {l.payment && (
              <AdminButton
                pending={pending}
                onClick={() => act({ action: "mark_paid" }, t("listing.toasts.paid"))}
              >
                {t("listing.actions.markPaid")}
              </AdminButton>
            )}
            <AdminButton
              pending={pending}
              onClick={() => act({ action: "waive_fee" }, t("listing.toasts.waived"))}
            >
              {t("listing.actions.waive")}
            </AdminButton>
          </>
        )}

        {l.status === "published" && (
          <>
            <AdminButton
              pending={pending}
              icon={<CalendarPlus className="size-3.5" strokeWidth={2.4} />}
              onClick={() => act({ action: "extend", days: 30 }, t("listing.toasts.extended"))}
            >
              {t("listing.actions.extend")}
            </AdminButton>
            <AdminButton
              pending={pending}
              icon={
                featured ? (
                  <StarOff className="size-3.5" strokeWidth={2.4} />
                ) : (
                  <Star className="size-3.5" strokeWidth={2.4} />
                )
              }
              onClick={() =>
                featured
                  ? act({ action: "unfeature" }, t("listing.toasts.unfeatured"))
                  : act({ action: "feature", days: 30 }, t("listing.toasts.featured"))
              }
            >
              {featured ? t("listing.actions.unfeature") : t("listing.actions.feature")}
            </AdminButton>
            <AdminButton
              icon={<BadgeCheck className="size-3.5" strokeWidth={2.4} />}
              onClick={() => setConfirm("sold")}
            >
              {t("listing.actions.sold")}
            </AdminButton>
          </>
        )}

        {(l.status === "expired" || l.status === "archived" || l.status === "rejected") && (
          <AdminButton
            variant="primary"
            pending={pending}
            icon={<RotateCcw className="size-3.5" strokeWidth={2.4} />}
            onClick={() => act({ action: "republish" }, t("listing.toasts.republished"))}
          >
            {t("listing.actions.republish")}
          </AdminButton>
        )}

        <AdminButton
          variant="quiet"
          icon={<Pencil className="size-3.5" strokeWidth={2.4} />}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? t("common.close") : t("listing.actions.edit")}
        </AdminButton>

        {l.status !== "archived" && (
          <AdminButton
            variant="quiet"
            icon={<Archive className="size-3.5" strokeWidth={2.4} />}
            onClick={() => setConfirm("archive")}
          >
            {t("listing.actions.archive")}
          </AdminButton>
        )}

        <AdminButton
          variant="quiet"
          className="ms-auto"
          icon={<Trash2 className="size-3.5" strokeWidth={2.4} />}
          onClick={() => setConfirm("delete")}
        >
          {t("listing.actions.delete")}
        </AdminButton>
      </footer>

      <Confirm
        open={confirm === "reject"}
        title={t("listing.confirm.rejectTitle")}
        body={t("listing.confirm.rejectBody")}
        confirmLabel={t("listing.actions.reject")}
        pending={pending}
        reason={{
          label: t("common.reasonForSeller"),
          placeholder: t("listing.confirm.rejectPlaceholder"),
          required: true,
        }}
        onCancel={() => setConfirm(null)}
        onConfirm={async (reason) => {
          if (await act({ action: "reject", reason }, t("listing.toasts.rejected"))) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "archive"}
        title={t("listing.confirm.archiveTitle")}
        body={t("listing.confirm.archiveBody")}
        confirmLabel={t("listing.actions.archive")}
        variant="default"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (await act({ action: "archive" }, t("listing.toasts.archived"))) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "sold"}
        title={t("listing.confirm.soldTitle")}
        body={t("listing.confirm.soldBody")}
        confirmLabel={t("listing.confirm.soldConfirm")}
        variant="primary"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (await act({ action: "mark_sold" }, t("listing.toasts.sold"))) setConfirm(null);
        }}
      />
      <Confirm
        open={confirm === "delete"}
        title={t("listing.confirm.deleteTitle")}
        body={t("listing.confirm.deleteBody")}
        confirmLabel={t("listing.actions.delete")}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (await act({ action: "delete" }, t("listing.toasts.deleted"))) setConfirm(null);
        }}
      />
    </div>
  );
}

/**
 * The corrections a moderator actually makes — a price with a zero too many,
 * a title in capitals, a wrong number. Category and attributes are absent on
 * purpose: those change what the annonce *is*, and belong in the seller's own
 * form rather than in a moderation pane.
 */
function EditForm({ listing, onDone }: { listing: PanelListing; onDone: () => void }) {
  const { run, pending } = useAdminAction();
  const t = useTranslations("adminOps");
  const locale = useLocale();
  const [title, setTitle] = useState(listing.title);
  const [price, setPrice] = useState<number | null>(listing.price);
  const [negotiable, setNegotiable] = useState(listing.negotiable);
  const [onRequest, setOnRequest] = useState(listing.priceOnRequest);
  const [phone, setPhone] = useState(listing.contactPhone ?? "");
  const [name, setName] = useState(listing.contactName ?? "");
  const [description, setDescription] = useState(listing.description ?? "");

  async function save() {
    const ok = await run({
      url: `/api/admin/annonces/${listing.id}`,
      method: "POST",
      body: {
        action: "edit",
        fields: {
          title,
          price: onRequest ? null : price,
          negotiable,
          price_on_request: onRequest,
          contact_phone: phone,
          contact_name: name,
          description,
        },
      },
      success: t("listing.toasts.edited"),
    });
    if (ok) onDone();
  }

  return (
    <div className="mt-4 border-s-2 border-[var(--gold)] ps-4">
      <h3 className={`${EYEBROW} text-[var(--gold)]`}>{t("listing.edit.title")}</h3>
      <div className="mt-3 space-y-3.5">
        <TextField label={t("listing.edit.fieldTitle")} value={title} onChange={setTitle} required />
        <FieldGrid>
          <NumberField
            label={t("listing.edit.price")}
            value={price}
            onChange={setPrice}
            min={0}
            suffix={currencyLabel(locale)}
            disabled={onRequest}
            hint={onRequest ? t("listing.edit.onRequestDisabled") : undefined}
          />
          <div className="flex flex-col justify-center gap-2.5 pt-2">
            <ToggleField label={t("listing.edit.negotiable")} checked={negotiable} onChange={setNegotiable} />
            <ToggleField label={t("listing.edit.priceOnRequest")} checked={onRequest} onChange={setOnRequest} />
          </div>
        </FieldGrid>
        <FieldGrid>
          <TextField label={t("listing.edit.phone")} value={phone} onChange={setPhone} type="tel" />
          <TextField label={t("listing.edit.name")} value={name} onChange={setName} />
        </FieldGrid>
        <TextareaField label={t("listing.edit.description")} value={description} onChange={setDescription} rows={4} />
        <div className="flex justify-end gap-2">
          <AdminButton variant="quiet" onClick={onDone}>
            {t("common.cancel")}
          </AdminButton>
          <AdminButton variant="primary" pending={pending} onClick={save}>
            {t("common.save")}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
