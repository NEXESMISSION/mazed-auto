import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFacts, type ListingFacts } from "./facts";

/**
 * The adapter between Mazed Auto's annonces and the Social Publisher — the one
 * file of the module that knows what an annonce is (plan §4). A Mazed Immo
 * version would read its own table here and leave the rest untouched.
 *
 * Read fresh every time: generation and every later edit are checked against
 * the annonce as it is now, not as it was when the draft was made.
 */

export type SocialListing = {
  id: string;
  shopId: string | null;
  status: string;
  facts: ListingFacts;
  photos: { storage_path: string; sort_order: number; is_cover: boolean | null }[];
};

export async function loadSocialListing(admin: SupabaseClient, listingId: string): Promise<SocialListing | null> {
  const { data } = await admin
    .from("listings")
    .select(
      `id, shop_id, status, title, reference, listing_type, attributes, condition, price, price_unit,
       price_on_request, negotiable, governorate, delegation,
       category:categories (label_fr), shop:shops (name),
       photos:listing_photos (storage_path, sort_order, is_cover)`,
    )
    .eq("id", listingId)
    .maybeSingle();
  if (!data) return null;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const l = data as unknown as {
    id: string; shop_id: string | null; status: string; title: string; reference: string | null; listing_type: string | null;
    attributes: Record<string, unknown> | null; condition: string | null; price: number | null; price_unit: string | null;
    price_on_request: boolean; negotiable: boolean; governorate: string; delegation: string | null;
    category: { label_fr: string } | { label_fr: string }[] | null; shop: { name: string } | { name: string }[] | null;
    photos: { storage_path: string; sort_order: number; is_cover: boolean | null }[] | null;
  };
  return {
    id: l.id,
    shopId: l.shop_id,
    status: l.status,
    photos: l.photos ?? [],
    facts: buildFacts({
      title: l.title,
      reference: l.reference,
      listing_type: l.listing_type,
      attributes: l.attributes,
      condition: l.condition,
      price: l.price,
      price_unit: l.price_unit,
      price_on_request: l.price_on_request,
      negotiable: l.negotiable,
      governorate: l.governorate,
      city: l.delegation,
      shopName: one(l.shop)?.name ?? null,
      categoryLabel: one(l.category)?.label_fr ?? null,
    }),
  };
}
