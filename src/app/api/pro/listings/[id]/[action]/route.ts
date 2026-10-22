import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { publicationErrorFromDb } from "@/lib/publication";
import { refusalResponse } from "@/lib/http/refusal";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/pro/listings/[id]/pause | resume — the shop chooses which of its
 * annonces are live.
 *
 * When a plan is changed for a smaller one, the surplus is paused (0192) and
 * the owner picks what stays: pausing one frees its place, resuming another
 * takes it — through the quota trigger like any publication, so resuming past
 * the limit, or without a current period, is refused with a sentence. Paused
 * annonces keep everything; nothing here deletes.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await ctx.params;
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { data: listing } = await admin.from("listings").select("id, shop_id").eq("id", id).maybeSingle();
  if (!listing?.shop_id) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  const gate = await requireShopRole(req, listing.shop_id as string, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;

  const { data, error } = await admin.rpc(action === "pause" ? "pause_shop_listing" : "resume_shop_listing", {
    p_listing: id,
  });
  if (error) {
    const refusal = publicationErrorFromDb(error);
    return refusal ? refusalResponse(refusal) : fail(`listing_${action}_failed`, 500, error);
  }
  if (data !== "paused" && data !== "resumed") {
    return NextResponse.json({ error: data, detail: "Cette annonce ne peut pas changer d'état ainsi." }, { status: 409 });
  }
  logAction(req, gate.user, `listing.${action}`, { id, shopId: listing.shop_id });
  return NextResponse.json({ ok: true, status: data });
}
