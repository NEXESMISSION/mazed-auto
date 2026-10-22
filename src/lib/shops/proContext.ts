import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { MemberRole } from "@/lib/shops/server";

/**
 * The signed-in person's shop, for the pro dashboard.
 *
 * Wrapped in React `cache` so the layout and the page of one request share a
 * single read. Membership is read with the service role — the person's own
 * token cannot read `shops.phone` (0185) and the dashboard needs it — and it
 * is the membership row, not anything in the request, that decides which shop
 * this is. One open shop per account (0185), so the first open one is it.
 */

export type ProShop = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  activity_type: string;
  description: string | null;
  logo_path: string | null;
  banner_path: string | null;
  governorate: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  opening_hours: Record<string, unknown> | null;
  status: string;
  verification_status: string;
  rejection_reason: string | null;
  created_at: string;
};

export type ProContext =
  | { kind: "anonymous" }
  | { kind: "no_shop"; user: User }
  | { kind: "shop"; user: User; admin: SupabaseClient; shop: ProShop; role: MemberRole };

export const getProContext = cache(async (): Promise<ProContext> => {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "anonymous" };
  const admin = getServiceSupabase();
  if (!admin) return { kind: "no_shop", user };

  const { data } = await admin
    .from("shop_members")
    .select(
      `role, shop:shops (id, owner_id, slug, name, activity_type, description, logo_path, banner_path,
       governorate, city, address, phone, whatsapp, opening_hours, status, verification_status,
       rejection_reason, created_at)`,
    )
    .eq("user_id", user.id);

  const rows = (data ?? []) as unknown as { role: MemberRole; shop: ProShop | null }[];
  const open = rows.filter((r) => r.shop && r.shop.status !== "closed");
  // An owner's own shop first, then any shop they manage.
  open.sort((a, b) => (a.role === "owner" ? -1 : 0) - (b.role === "owner" ? -1 : 0));
  const pick = open[0];
  if (!pick?.shop) return { kind: "no_shop", user };
  return { kind: "shop", user, admin, shop: pick.shop, role: pick.role };
});
