import { NextRequest, NextResponse } from "next/server";
import { apiTranslations } from "@/i18n/api";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { sanitizeShopProfile, type ShopProfileInput } from "@/lib/shops/profile";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/pro/shops/[id] — the owner edits the shop's page: name,
 * description, contact lines, address, hours, logo and banner.
 *
 * Only what `sanitizeShopProfile` lets through is written. Status,
 * verification, activity and slug are not editable here, and the database
 * refuses them from any route anyway (`_guard_shop_state`, 0185).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireShopRole(req, id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { user, admin } = gate;

  const body = (await req.json().catch(() => ({}))) as ShopProfileInput;
  const { patch, errors } = sanitizeShopProfile(body, id);
  if (errors.length > 0) {
    const t = await apiTranslations(req, "pro.profileErrors");
    return NextResponse.json({ error: "invalid", detail: errors.map((e) => t(e)).join(" ") }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const { error } = await admin.from("shops").update(patch).eq("id", id);
  if (error) {
    if (error.message.includes("shop_state_admin_only")) {
      return NextResponse.json({ error: "forbidden_field" }, { status: 403 });
    }
    return fail("shop_update_failed", 500, error);
  }

  logAction(req, user, "shop.profile.update", { shopId: id, fields: Object.keys(patch) });
  return NextResponse.json({ ok: true, updated: Object.keys(patch).length });
}
