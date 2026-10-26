import { cache } from "react";
import { getServiceSupabase } from "@/lib/supabase/admin";

/**
 * One annonce, read once per request: the [id] layout (which decides the 404),
 * generateMetadata and the page all ask for it, and `cache` makes that a single
 * query.
 */
export type Row = {
  id: string; title: string; description: string | null;
  price: number | null; price_on_request: boolean; negotiable: boolean;
  condition: string | null; governorate: string; delegation: string | null;
  attributes: Record<string, unknown> | null;
  contact_name: string | null; show_phone: boolean;
  status: string; published_at: string | null; expires_at: string | null;
  reference: string | null;
  seller_id: string;
  shop_id: string | null;
  price_unit: string;
  shop: ShopRef | ShopRef[] | null;
  category: CategoryRef | CategoryRef[] | null;
  photos: { storage_path: string; sort_order: number }[] | null;
  fitments: { make: string; model: string | null; year_from: number | null; year_to: number | null }[] | null;
};

type ShopRef = { slug: string; name: string; status: string; verification_status: string; activity_type: string };
type CategoryRef = { id: string; slug: string; label_fr: string; label_ar: string | null; kind: string };

const SELECT = `
  id, title, description, price, price_on_request, negotiable, condition,
  governorate, delegation, attributes, contact_name, show_phone, status,
  published_at, expires_at, seller_id, reference, shop_id, price_unit,
  shop:shops (slug, name, status, verification_status, activity_type),
  category:categories (id, slug, label_fr, label_ar, kind),
  photos:listing_photos (storage_path, sort_order),
  fitments:listing_fitments (make, model, year_from, year_to)
`;

export const fetchListing = cache(async (id: string): Promise<Row | null> => {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin.from("listings").select(SELECT).eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
});
