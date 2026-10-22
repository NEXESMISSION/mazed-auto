import { NextRequest, NextResponse } from "next/server";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/pro/shops/[id]/private — the shop's legal identity (raison
 * sociale, matricule fiscal, RNE, adresse du siège, e-mail de facturation).
 *
 * Kept in `shop_private`, which no visitor and no other account can read
 * (0185, recette 8). It is what invoices will be issued to (lot 4); nothing
 * here is ever rendered on a public page.
 */
const FIELDS = {
  legal_name: 120,
  tax_id: 40,
  rne_number: 40,
  legal_address: 240,
  contact_email: 120,
} as const;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireShopRole(req, id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { user, admin } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row: Record<string, string | null> = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;
    const v = body[key];
    row[key] = typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  }
  if (row.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) {
    return NextResponse.json({ error: "invalid", detail: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (Object.keys(row).length === 0) return NextResponse.json({ ok: true, updated: 0 });

  const { error } = await admin.from("shop_private").upsert({ shop_id: id, ...row }, { onConflict: "shop_id" });
  if (error) return fail("shop_private_failed", 500, error);

  logAction(req, user, "shop.private.update", { shopId: id, fields: Object.keys(row) });
  return NextResponse.json({ ok: true });
}
