import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { fail } from "@/lib/http/errors";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { memberRole, type MemberRole } from "@/lib/shops/server";
import { apiTranslations } from "@/i18n/api";

/**
 * The gate in front of every /api/pro/shops/[id]/** route: same origin, signed
 * in, not suspended, and a member of THIS shop with one of `roles`. Membership
 * is read from `shop_members` by the server; the shop id in the URL is a
 * question, never an answer (recette 8).
 *
 *   const gate = await requireShopRole(req, id, CAN_EDIT_SHOP);
 *   if (gate instanceof NextResponse) return gate;
 */
export async function requireShopRole(
  req: NextRequest,
  shopId: string,
  roles: MemberRole[],
): Promise<{ user: User; admin: SupabaseClient; role: MemberRole } | NextResponse> {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const suspended = await refuseIfSuspended(admin, user.id);
  if (suspended) return suspended;

  const role = /^[0-9a-f-]{36}$/i.test(shopId) ? await memberRole(admin, user.id, shopId) : null;
  if (!role || !roles.includes(role)) {
    return NextResponse.json(
      { error: "not_shop_member", detail: (await apiTranslations(req, "pro.api"))("cannotEdit") },
      { status: 403 },
    );
  }
  return { user, admin, role };
}
