import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { apiTranslations } from "@/i18n/api";

/**
 * An admin's answer to a shop's request (0196).
 *
 *   POST { decision: "approve" }            → the shop may pay
 *   POST { decision: "reject", reason }     → refused; a refused opening refuses the shop
 *   POST { decision: "revoke", reason }     → an approval taken back before it was paid
 *
 * The decision is admin_decide_pro_request's, called with the ADMIN'S OWN
 * SESSION: it checks is_admin() itself, the audit row carries who decided,
 * and it tells the seller — with the reason on a refusal.
 */

/** Codes the function raises, worded under `adminOps.api.request`. */
const DB_CODES = [
  "reason_required", "forbidden", "request_not_found", "request_already_decided", "payment_in_progress", "bad_decision",
];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user, supabase } = gate;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { decision?: unknown; reason?: unknown };
  const decision = typeof body.decision === "string" ? body.decision : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const { data, error } = await supabase.rpc("admin_decide_pro_request", {
    p_request: id, p_decision: decision, p_reason: reason || null,
  });
  if (error) {
    const code = DB_CODES.find((k) => error.message.includes(k));
    if (!code) return fail("request_decide_failed", 500, error);
    const t = await apiTranslations(req, "adminOps.api");
    return NextResponse.json(
      { error: code, detail: t(`request.${code}`) },
      { status: code === "forbidden" ? 403 : code === "request_not_found" ? 404 : 400 },
    );
  }

  logAction(req, user, `admin.request.${decision}`, { id, reason: reason || undefined });
  return NextResponse.json({ ok: true, request: data });
}
