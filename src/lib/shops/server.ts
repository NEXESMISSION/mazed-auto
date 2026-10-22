import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingType, QuotaStatus, ShopSummary } from "@/lib/publication";

/**
 * Server-side reads behind the publication rules (src/lib/publication.ts).
 * Every caller passes the SERVICE-ROLE client: shops and quotas are not
 * readable or writable by a seller's own token (migrations 0185, 0189), and
 * membership is checked here, by the server, not taken from the request.
 */

type ShopRow = { id: string; name: string; slug: string; status: string; activity_type: string };

function toSummary(r: ShopRow): ShopSummary {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    activityType: r.activity_type as ListingType,
  };
}

/** Every shop this person belongs to, whatever its status. */
export async function memberShops(admin: SupabaseClient, userId: string): Promise<ShopSummary[]> {
  const { data } = await admin
    .from("shop_members")
    .select("shop:shops (id, name, slug, status, activity_type)")
    .eq("user_id", userId);
  return (data ?? [])
    .map((r) => (r as unknown as { shop: ShopRow | null }).shop)
    .filter((s): s is ShopRow => s !== null)
    .map(toSummary);
}

export type MemberRole = "owner" | "manager" | "staff";

/** This person's role in this shop, or null if they are not a member. */
export async function memberRole(
  admin: SupabaseClient,
  userId: string,
  shopId: string,
): Promise<MemberRole | null> {
  const { data } = await admin
    .from("shop_members")
    .select("role")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as MemberRole | undefined) ?? null;
}

/** Who may change the shop itself (its page, its legal details): not staff. */
export const CAN_EDIT_SHOP: MemberRole[] = ["owner", "manager"];

export async function shopSummary(admin: SupabaseClient, shopId: string): Promise<ShopSummary | null> {
  const { data } = await admin
    .from("shops")
    .select("id, name, slug, status, activity_type")
    .eq("id", shopId)
    .maybeSingle();
  return data ? toSummary(data as ShopRow) : null;
}

/**
 * How many annonces of this type the seller (or their shop) has live, against
 * what is allowed. `exclude` leaves one annonce out of the count — the one
 * being submitted, if it is somehow already counted.
 */
export async function quotaStatus(
  admin: SupabaseClient,
  sellerId: string,
  shopId: string | null,
  listingType: ListingType,
  exclude?: string,
): Promise<QuotaStatus> {
  const { data, error } = await admin.rpc("listing_quota_status", {
    p_seller: sellerId,
    p_shop: shopId,
    p_listing_type: listingType,
    p_exclude: exclude ?? null,
  });
  if (error || !data) {
    throw new Error(`listing_quota_status failed: ${error?.message ?? "no data"}`);
  }
  return data as QuotaStatus;
}
