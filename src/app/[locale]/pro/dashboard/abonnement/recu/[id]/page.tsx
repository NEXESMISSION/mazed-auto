import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import { currencyLabel } from "@/lib/utils";
import { getProContext } from "@/lib/shops/proContext";
import { PrintButton } from "./PrintButton";

/**
 * Reçu de paiement — what was paid, when, for what, by whom.
 *
 * A RECEIPT, numbered in capture order (R2026-000001, 0191), not an invoice:
 * invoicing (HT / TVA / timbre, legal numbering) waits until D-P6 is settled
 * with an accountant, and the page says so. Only for this shop's own captured
 * payments.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop } = ctx;

  const { data: pay } = await admin
    .from("payments")
    .select("id, kind, amount, status, provider, reviewed_at, updated_at, receipt_number, metadata, shop_id")
    .eq("id", id)
    .maybeSingle();
  if (!pay || pay.shop_id !== shop.id || pay.status !== "captured" || !pay.receipt_number) notFound();

  const meta = (pay.metadata ?? {}) as { product_id?: string; listing_id?: string };
  const [{ data: priv }, { data: payee }, { data: sub }, { data: listing }] = await Promise.all([
    admin.from("shop_private").select("legal_name, tax_id, legal_address").eq("shop_id", shop.id).maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "payee_name").maybeSingle(),
    admin.from("subscriptions").select("starts_at, ends_at, product:products (name_fr, name_ar)").eq("payment_id", pay.id).maybeSingle(),
    meta.listing_id
      ? admin.from("listings").select("title, reference").eq("id", meta.listing_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const locale = await getLocale();
  const t = await getTranslations("pro.receipt");
  const date = (iso: string) => formatDate(iso, locale);
  const product = sub?.product
    ? (Array.isArray(sub.product) ? sub.product[0] : sub.product) as { name_fr: string; name_ar: string | null }
    : null;
  const plan = (locale === "ar" && product?.name_ar ? product.name_ar : product?.name_fr) ?? "";
  const what = pay.kind === "subscription"
    ? sub
      ? t("subscriptionPeriod", { plan, from: date(sub.starts_at as string), to: date(sub.ends_at as string) })
      : t("subscription", { plan })
    : listing
      ? t("boostListing", { reference: (listing.reference as string | null) ?? "", title: listing.title as string })
      : t("boost");
  const payeeName = typeof payee?.value === "string" && payee.value ? payee.value : "Mazed Auto";

  return (
    <article id="receipt" className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-6 print:border-0 print:bg-white print:text-black">
      {/* On paper, the receipt alone — not the site's header, tabs and bars. */}
      <style>{`@media print { body * { visibility: hidden; } #receipt, #receipt * { visibility: visible; } #receipt { position: absolute; inset: 0 auto auto 0; width: 100%; } }`}</style>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{t("title")}</p>
          <h1 className="batta-tabular mt-1 text-[22px] font-black">{pay.receipt_number}</h1>
          <p className="text-[12.5px] text-muted">{date((pay.reviewed_at ?? pay.updated_at) as string)}</p>
        </div>
        <PrintButton />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-[13px]">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{t("receivedBy")}</dt>
          <dd className="mt-0.5 font-bold">{payeeName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{t("from")}</dt>
          <dd className="mt-0.5 font-bold">{priv?.legal_name ?? shop.name}</dd>
          {priv?.tax_id && (
            <dd className="text-muted">{t.rich("taxId", { id: priv.tax_id as string, tax: (c) => <span className="ltr-island">{c}</span> })}</dd>
          )}
          {priv?.legal_address && <dd className="text-muted">{priv.legal_address}</dd>}
        </div>
      </dl>

      <div className="mt-6 flex items-start justify-between gap-4 border-y border-border py-3 text-[13.5px]">
        <span>{what}</span>
        <span className="batta-tabular shrink-0 font-black">
          {/* Millimes on a receipt, in the French form on both pages: « 1.500 »
              would read as one dinar five hundred in Tunisia either way. */}
          {Number(pay.amount).toLocaleString("fr-FR", { minimumFractionDigits: 3 })} {currencyLabel(locale)}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {pay.provider === "konnect" ? t("paidOnline") : t("paidTransfer")}
      </p>
      <p className="mt-6 text-[11px] leading-relaxed text-muted">
        {t("notInvoice")}
      </p>
    </article>
  );
}
