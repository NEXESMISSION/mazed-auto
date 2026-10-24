import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { fail } from "@/lib/http/errors";
import { logAction } from "@/lib/activity";

/**
 * POST /api/pro/social/accounts/[id]/disconnect — forget a connected account.
 * The token is erased, not just flagged: a disconnected account can publish
 * nothing, and the row stays so the history of its posts keeps a name. An
 * Instagram account linked to the Page goes with it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin0 = getServiceSupabase();
  if (!admin0) return fail("server_misconfigured", 500);
  const { data: account } = await admin0.from("social_accounts").select("id, shop_id").eq("id", id).maybeSingle();
  if (!account?.shop_id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gate = await requireShopRole(req, account.shop_id as string, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { error } = await gate.admin
    .from("social_accounts")
    .update({ status: "revoked", token_ciphertext: null, updated_at: new Date().toISOString() })
    .or(`id.eq.${id},parent_account_id.eq.${id}`);
  if (error) return fail("social_disconnect_failed", 500, error);
  logAction(req, gate.user, "social.account_disconnected", { id });
  return NextResponse.json({ ok: true });
}
