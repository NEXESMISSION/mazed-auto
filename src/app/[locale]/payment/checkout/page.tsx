import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { paymentInstructions, fetchPayeeDetails } from "@/lib/payments";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

export type CheckoutKind = "listing_fee";

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

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/${locale}/login?next=${encodeURIComponent(`/payment/checkout?payment=${paymentParam ?? ""}`)}`,
    );
  }

  if (!paymentParam) notFound();

  // SERVICE-ROLE read. `payee_name/bank/rib/iban/d17` are NOT in the
  // app_settings public-read policy (0043), so under the buyer's own RLS the
  // query returns nothing and fetchPayeeDetails falls back to its TEST
  // PLACEHOLDER account — meaning every buyer was being told to wire their
  // money to a placeholder RIB, while an admin (who can read the table) saw the
  // real one and assumed all was well. These are the numbers the user is asked
  // to send money to: they must come from the admin settings, for everyone.
  const payee = await fetchPayeeDetails(getServiceSupabase() ?? supabase);

  // `error` is captured, not discarded. Destructuring only `data` makes a query
  // failure indistinguishable from "no such payment", and both then surface as
  // a 404 — which is exactly how a stale column reference stays invisible.
  const { data: pay, error } = await supabase
    .from("payments")
    .select("id, user_id, kind, amount, status, metadata")
    .eq("id", paymentParam)
    .maybeSingle();

  if (error) throw new Error(`checkout payment lookup failed: ${error.message}`);
  if (!pay || pay.user_id !== user.id) notFound();

  if (pay.status !== "pending" && pay.status !== "pending_review") {
    redirect(`/${locale}/payment/success?id=${pay.id}`);
  }

  const listing = await fetchListingSummary(
    (pay.metadata as { listing_id?: string } | null)?.listing_id,
  );

  return (
    <CheckoutClient
      paymentId={pay.id as string}
      userId={user.id}
      amount={Number(pay.amount)}
      listing={listing}
      instructions={paymentInstructions({
        paymentId: pay.id as string,
        amountTND: Number(pay.amount),
        payee,
      })}
      locale={locale}
      reupload={pay.status === "pending_review"}
      // A rejected receipt is often a rejected LISTING in disguise, so the
      // seller can go back and fix the annonce before paying again.
      editHref={
        listing ? `/${locale}/annonces/nouvelle?draft=${listing.id}` : undefined
      }
    />
  );
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
