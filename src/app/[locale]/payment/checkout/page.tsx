import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { paymentInstructions, fetchPaymentMethods } from "@/lib/payments";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

/** What the payment buys — it decides the page's title, its explanation and what happens once the receipt is accepted. */
export type CheckoutKind = "listing_fee" | "subscription" | "promo" | "other";

/** A shop plan, as the subscription checkout describes it. */
export type CheckoutPlan = { name: string; days: number | null; quota: number | null };

/**
 * Manual-receipt checkout — the one place a seller pays for a publication.
 *
 *   /payment/checkout?payment=<uuid>
 *
 * The seller submits an annonce, `/api/annonces/[id]/submit` creates a
 * `listing_fee` payment and returns its id, and the wizard sends them here to
 * choose a provider, read the transfer instructions and upload a receipt.
 *
 * WHY THIS WAS REWRITTEN. It resolved the payment's subject through
 * `payments.auction_id` / `payments.property_id`, and both `auctions` and
 * `properties` have read zero rows since the pivot. `fetchAuctionSummary` and
 * `fetchPropertySummary` therefore returned null for every real fee, so the
 * checkout rendered with no thumbnail, no title and an `editHref` pointing at
 * `/sell/<id>/edit` — a route deleted with the auction product. v3 fees never
 * populated either column anyway: they carry their subject in
 * `metadata.listing_id`, which is what /api/admin/paiements has always read.
 *
 * The auction entry mode is gone with it. It took `?type=deposit|buy_now|
 * final_payment&auction=<uuid>`, recomputed the amount from the lot, and read
 * `auctions`, `properties` and `auction_deposits`. There is one kind of payment
 * now, and it is always created before the seller arrives.
 */
export default async function CheckoutEntry({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment: paymentParam } = await searchParams;
  const locale = await getLocale();
  const tl = await getTranslations("payment.instructions");

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/${locale}/login?next=${encodeURIComponent(`/payment/checkout?payment=${paymentParam ?? ""}`)}`,
    );
  }

  if (!paymentParam) notFound();

  // SERVICE-ROLE read. `payment_methods` is NOT in the app_settings
  // public-read policy (0043): under the buyer's own RLS the row reads as
  // missing, which now means « nothing offered » — not, as it once did, a
  // placeholder account to wire money to. These are the details a buyer is
  // asked to send money to: they come from « Moyens de paiement », for everyone.
  const methods = await fetchPaymentMethods(getServiceSupabase() ?? supabase);

  // `error` is captured, not discarded. Destructuring only `data` makes a query
  // failure indistinguishable from "no such payment", and both then surface as
  // a 404 — which is exactly how a stale column reference stays invisible.
  const { data: pay, error } = await supabase
    .from("payments")
    .select("id, user_id, kind, amount, status, metadata, shop_id, receipt_uploaded_at")
    .eq("id", paymentParam)
    .maybeSingle();

  if (error) throw new Error(`checkout payment lookup failed: ${error.message}`);
  if (!pay || pay.user_id !== user.id) notFound();

  if (pay.status !== "pending" && pay.status !== "pending_review") {
    redirect(`/${locale}/payment/success?id=${pay.id}`);
  }

  const meta = (pay.metadata ?? {}) as { listing_id?: string; product_id?: string };
  const listing = await fetchListingSummary(meta.listing_id);
  const kind: CheckoutKind =
    pay.kind === "listing_fee" || pay.kind === "subscription" || pay.kind === "promo" ? pay.kind : "other";
  const plan = kind === "subscription" ? await fetchPlan(meta.product_id, locale) : null;

  return (
    <CheckoutClient
      paymentId={pay.id as string}
      userId={user.id}
      amount={Number(pay.amount)}
      listing={listing}
      instructions={paymentInstructions({
        paymentId: pay.id as string,
        amountTND: Number(pay.amount),
        methods,
        label: (key) => tl(key),
      })}
      locale={locale}
      kind={kind}
      plan={plan}
      // A receipt is already with the team: the page says so first, and the
      // upload is a « replace » the seller opens on purpose. It used to show a
      // red « Reçu précédent refusé » here — for a receipt nobody had refused.
      underReview={pay.status === "pending_review"}
      receiptAt={(pay.receipt_uploaded_at as string | null) ?? null}
      shopOrder={pay.shop_id != null}
      // A rejected receipt is often a rejected LISTING in disguise, so the
      // seller can go back and fix the annonce before paying again.
      editHref={
        listing ? `/${locale}/annonces/nouvelle?draft=${listing.id}` : undefined
      }
    />
  );
}

/** The plan a subscription payment buys: its name, length and listing quota. */
async function fetchPlan(productId: string | undefined, locale: string): Promise<CheckoutPlan | null> {
  if (!productId) return null;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("products")
    .select("name_fr, name_ar, duration_days, listing_quota")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return null;
  const p = data as { name_fr: string; name_ar: string | null; duration_days: number | null; listing_quota: number | null };
  return {
    name: locale === "ar" && p.name_ar ? p.name_ar : p.name_fr,
    days: p.duration_days,
    quota: p.listing_quota,
  };
}

/**
 * The annonce this fee buys.
 *
 * Resolved through `metadata.listing_id`: `payments` has no column pointing at
 * `listings`, and the two it used to have pointed at tables that read zero
 * rows. Returns null rather than throwing when the annonce has since been
 * deleted — the receipt still needs paying, and a checkout with no thumbnail
 * beats a 404 over a missing photo.
 */
async function fetchListingSummary(listingId: string | undefined) {
  if (!listingId) return null;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("listings")
    .select("id, title, governorate, photos:listing_photos (storage_path, sort_order)")
    .eq("id", listingId)
    .maybeSingle();
  if (!data) return null;
  const l = data as unknown as {
    id: string;
    title: string;
    governorate: string;
    photos: { storage_path: string; sort_order: number }[] | null;
  };
  const hero = (l.photos ?? []).slice().sort((x, y) => x.sort_order - y.sort_order)[0];
  return {
    id: l.id,
    title: l.title,
    governorate: l.governorate,
    heroPhotoPath: hero?.storage_path ?? null,
  };
}
