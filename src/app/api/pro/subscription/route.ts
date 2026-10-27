import { NextRequest, NextResponse } from "next/server";
import { apiTranslations, localeFromRequest } from "@/i18n/api";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { refuseIfSuspended } from "@/lib/http/suspended";
import { overLimit, tooMany } from "@/lib/http/rateLimit";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { formatDate } from "@/lib/dates";
import { CAN_EDIT_SHOP, memberRole } from "@/lib/shops/server";
import { SCHEDULE_ACTIONS, subscriptionError, type ScheduleAction } from "@/lib/shops/subscription";

/**
 * POST /api/pro/subscription — what a shop schedules for its renewal (0198).
 *
 *   { shop_id, action: "cancel" }                     no renewal; the plan runs to its end
 *   { shop_id, action: "resume" }                     the renewal again
 *   { shop_id, action: "downgrade", plan_code }       the renewal takes a lower plan
 *   { shop_id, action: "undo_downgrade" }             the renewal keeps the plan
 *
 * Nothing here is paid or refunded: the change waits for the renewal date.
 * One change at a time — a cancellation withdraws a downgrade and the other
 * way round — and none while an order is open (`shop_subscription_change`).
 */
export async function POST(req: NextRequest) {
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
  if (await overLimit(admin, `subscription:${user.id}`, 30, 3600)) return tooMany();

  const body = (await req.json().catch(() => ({}))) as { shop_id?: unknown; action?: unknown; plan_code?: unknown };
  const shopId = typeof body.shop_id === "string" && /^[0-9a-f-]{36}$/i.test(body.shop_id) ? body.shop_id : null;
  const action = SCHEDULE_ACTIONS.find((a) => a === body.action) as ScheduleAction | undefined;
  if (!shopId || !action) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const role = await memberRole(admin, user.id, shopId);
  if (!role || !CAN_EDIT_SHOP.includes(role)) {
    return NextResponse.json({ error: "not_shop_member", detail: (await apiTranslations(req, "pro.api"))("notShopMember") }, { status: 403 });
  }

  let productId: string | null = null;
  if (action === "downgrade") {
    const { data } = await admin
      .from("products")
      .select("id")
      .eq("plan_code", typeof body.plan_code === "string" ? body.plan_code : "")
      .eq("kind", "subscription")
      .eq("is_active", true)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "not_for_sale", detail: (await apiTranslations(req, "pro.api"))("notForSale") }, { status: 409 });
    }
    productId = data.id as string;
  }

  const { data, error } = await admin.rpc("shop_subscription_change", {
    p_shop: shopId, p_actor: user.id, p_action: action, p_product: productId,
  });
  if (error) {
    const known = subscriptionError(error.message);
    if (!known) return fail("subscription_change_failed", 500, error);
    const t = await apiTranslations(req, "pro.api.subscription");
    return NextResponse.json({ error: known, detail: t(known, { date: "" }) }, { status: 409 });
  }

  const result = data as { unchanged?: boolean; effective_at?: string; renews_at?: string };
  logAction(req, user, `pro.subscription.${action}`, { shopId, planCode: action === "downgrade" ? body.plan_code : undefined });
  const t = await apiTranslations(req, "pro.api.subscription.done");
  const when = result.effective_at ?? result.renews_at;
  return NextResponse.json({
    ok: true,
    unchanged: result.unchanged === true,
    message: t(action, { date: when ? formatDate(when, localeFromRequest(req)) : "" }),
  });
}
