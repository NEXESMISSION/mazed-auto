import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Are the shop pages public yet?
 *
 * `app_settings.pro_shops.enabled` (0189) is the switch. While it is off the
 * directory, the storefronts and the shop links on annonces do not exist for
 * visitors — a 404, not a "coming soon" page — but an ADMIN still sees them,
 * with a banner, so what goes live can be checked on the real site before
 * anyone else can reach it.
 */
export async function shopsGate(admin: SupabaseClient): Promise<{
  enabled: boolean;
  /** An admin looking at pages that are not public yet. */
  preview: boolean;
  visible: boolean;
}> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "pro_shops").maybeSingle();
  const enabled = (data?.value as { enabled?: boolean } | null)?.enabled === true;
  if (enabled) return { enabled, preview: false, visible: true };

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { enabled, preview: false, visible: false };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  return { enabled, preview: isAdmin, visible: isAdmin };
}

/**
 * May the person looking see THIS shop's page? Yes when shop pages are public
 * or they are an admin (`shopsGate`) — and also, before launch, when it is
 * their own shop: an owner should see and complete their page before buyers
 * can. Returns how they see it, so the page can say so.
 */
export async function shopViewer(
  admin: SupabaseClient,
  shopId: string,
): Promise<"public" | "admin" | "owner" | null> {
  const gate = await shopsGate(admin);
  if (gate.enabled) return "public";
  if (gate.preview) return "admin";
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await admin
    .from("shop_members")
    .select("role")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? "owner" : null;
}

/** Public URL of a logo or banner in the `shop-media` bucket (0185). */
export function shopMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/shop-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The columns of a shop a visitor may see — no phone, no owner, no rejection text. */
export const SHOP_PUBLIC_SELECT =
  "id, slug, name, activity_type, description, logo_path, banner_path, governorate, city, address, opening_hours, verification_status, created_at";

export type PublicShop = {
  id: string;
  slug: string;
  name: string;
  activity_type: string;
  description: string | null;
  logo_path: string | null;
  banner_path: string | null;
  governorate: string;
  city: string | null;
  address: string | null;
  opening_hours: Record<string, unknown> | null;
  verification_status: string;
  created_at: string;
};
