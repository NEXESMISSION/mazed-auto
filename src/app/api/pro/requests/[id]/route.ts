import { NextRequest, NextResponse } from "next/server";
import { apiTranslations } from "@/i18n/api";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { CAN_EDIT_SHOP, memberRole } from "@/lib/shops/server";

/**
 * POST /api/pro/requests/[id] { action: "cancel" } — a shop withdraws what it
 * asked the back office for (0196): a plan it no longer wants, or one it wants
 * to swap for another. Pending or approved, never once its payment is on its
 * way — that payment is what decides then. Withdrawing an opening leaves the
 * shop a draft, ready to ask again (`_pro_request_after`).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "cancel" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const t = await apiTranslations(req, "pro.api");

  const { data: request } = await admin
    .from("pro_requests")
    .select("id, shop_id, status")
    .eq("id", id)
    .maybeSingle();
  const role = request ? await memberRole(admin, user.id, request.shop_id as string) : null;
  if (!request || !role || !CAN_EDIT_SHOP.includes(role)) {
    return NextResponse.json({ error: "not_found", detail: t("requestNotFound") }, { status: 404 });
  }
  if (request.status !== "pending" && request.status !== "approved") {
    return NextResponse.json({ error: "not_open", detail: t("requestClosed") }, { status: 409 });
  }
  // Money possibly on its way — a receipt sent, a Konnect page opened in the
  // last two hours — and the payment decides. An order left at « à régler »
  // with no receipt is dropped with the request (the same rule an admin's
  // « revoke » follows, 0196).
  const { data: paying } = await admin
    .from("payments")
    .select("id, status, provider, created_at")
    .eq("metadata->>request_id", id)
    .in("status", ["pending", "pending_review"]);
  const recent = Date.now() - 2 * 3600_000;
  if ((paying ?? []).some((p) =>
    p.status === "pending_review" || (p.provider === "konnect" && new Date(p.created_at as string).getTime() > recent))) {
    return NextResponse.json({ error: "payment_in_progress", detail: t("requestPaying") }, { status: 409 });
  }

  const { error } = await admin
    .from("pro_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["pending", "approved"]);
  if (error) return fail("request_cancel_failed", 500, error);
  if (paying?.length) {
    await admin
      .from("payments")
      .update({ status: "failed", admin_notes: "Demande annulée par la boutique" })
      .in("id", paying.map((p) => p.id as string))
      .eq("status", "pending");
  }

  logAction(req, user, "pro.request.cancel", { requestId: id, shopId: request.shop_id });
  return NextResponse.json({ ok: true, message: t("requestCancelled") });
}
