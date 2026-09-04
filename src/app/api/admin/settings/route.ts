import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * Réglages — the settings that are NOT prices.
 *
 * This route used to write `fee_listing_auction`, `fee_listing_direct`,
 * `promo_home`, `promo_top`, `promo_banner`, `deposit`, `commission` and
 * `final_payment_days`. Every one of those was either a price or auction
 * machinery, and the price half was actively harmful: `/admin/pricing` writes
 * the `products` table, which the sell flow actually reads, while this route
 * wrote `app_settings` keys that only a legacy endpoint reads. They held
 * different numbers — 20 TND against 15 — so an admin who changed the
 * publication fee here changed nothing a seller would ever see.
 *
 * Prices live in `products` and nowhere else (PIVOT-PLAN §2.2). What is left
 * here is the payee block: the bank details a buyer is told to transfer to.
 * Getting those wrong sends real money to the wrong place, which is why they
 * are the one thing this screen still owns.
 */

/** The only keys this route may write. Anything else is a price or is dead. */
const TEXT_KEYS = ["payee_name", "payee_bank", "payee_rib", "payee_iban", "payee_d17"] as const;

const MAX = 120;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rows: { key: string; value: unknown; updated_by: string }[] = [];

  for (const key of TEXT_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (typeof raw !== "string") continue;
    rows.push({ key, value: raw.trim().slice(0, MAX), updated_by: user.id });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { error } = await admin.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return fail("settings_update_failed", 500, error);

  logAction(req, user, "admin.settings.update", { keys: rows.map((r) => r.key) });
  return NextResponse.json({ ok: true, updated: rows.length });
}
