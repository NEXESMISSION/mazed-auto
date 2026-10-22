import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * The admin's levers on one shop.
 *
 *   POST { action: "verify" }                          → badge « vérifiée »
 *   POST { action: "reject_verification", reason }     → verification refused
 *   POST { action: "suspend", reason }                 → shop offline, annonces stay
 *   POST { action: "activate" }                        → open (or reopen) the shop
 *   POST { action: "review_document", document_id, status: "accepted"|"rejected", note? }
 *   POST { action: "grant_period", plan_code, days, reason }
 *
 * Every decision goes through a database function that checks is_admin()
 * itself (admin_set_shop_state 0185, admin_review_shop_document and
 * admin_grant_subscription 0193), called with the ADMIN'S OWN SESSION — so the
 * audit_logs row carries who decided, and the service key could not do it on
 * its own. The owner is told what was decided, with the reason when there is
 * one.
 */

const DB_DETAIL: Record<string, string> = {
  reason_required: "Indiquez un motif : le propriétaire le lira.",
  forbidden: "Réservé aux administrateurs.",
  shop_not_found: "Boutique introuvable.",
  document_not_found: "Justificatif introuvable.",
  plan_not_found: "Formule inconnue.",
  invalid_days: "Entre 1 et 366 jours.",
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user, supabase } = gate;
  const { id } = await ctx.params;
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { data: shop } = await admin.from("shops").select("id, name, owner_id, status").eq("id", id).maybeSingle();
  if (!shop) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const refused = (error: { message: string }) => {
    const code = Object.keys(DB_DETAIL).find((k) => error.message.includes(k));
    return code
      ? NextResponse.json({ error: code, detail: DB_DETAIL[code] }, { status: code === "forbidden" ? 403 : 400 })
      : fail(`shop_${action}_failed`, 500, error);
  };
  const tell = (kind: string, title: string, text: string) =>
    admin
      .rpc("enqueue_notification", {
        p_user_id: shop.owner_id, p_kind: kind, p_title: title, p_body: text, p_link: "/pro/dashboard",
      })
      .then(() => {}, () => {});

  const setState = async (args: { p_status?: string; p_verification?: string; p_reason?: string }) =>
    supabase.rpc("admin_set_shop_state", { p_shop: id, ...args });

  if (action === "verify") {
    const { error } = await setState({ p_verification: "verified" });
    if (error) return refused(error);
    await tell("shop_verified", "Boutique vérifiée", `${shop.name} porte désormais le badge « Boutique vérifiée ».`);
  } else if (action === "reject_verification") {
    const { error } = await setState({ p_verification: "rejected", p_reason: reason });
    if (error) return refused(error);
    await tell("shop_verification_rejected", "Vérification refusée", `Motif : ${reason}. Vous pouvez envoyer de nouveaux justificatifs.`);
  } else if (action === "suspend") {
    const { error } = await setState({ p_status: "suspended", p_reason: reason });
    if (error) return refused(error);
    await tell("shop_suspended", "Boutique suspendue", `Motif : ${reason}. Contactez-nous pour en parler.`);
  } else if (action === "activate") {
    const { error } = await setState({ p_status: "active" });
    if (error) return refused(error);
    await tell("shop_active", "Boutique en ligne", `${shop.name} est de nouveau visible.`);
  } else if (action === "review_document") {
    const status = body.status === "accepted" || body.status === "rejected" ? body.status : null;
    if (!status || typeof body.document_id !== "string") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const { data: docShop, error } = await supabase.rpc("admin_review_shop_document", {
      p_doc: body.document_id, p_status: status, p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    });
    if (error) return refused(error);
    if (docShop !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (status === "rejected") {
      await tell("shop_document_rejected", "Justificatif refusé", `Motif : ${String(body.note ?? "").trim()}. Envoyez-en un nouveau depuis « Ma boutique ».`);
    }
  } else if (action === "grant_period") {
    const days = Number(body.days);
    const { error } = await supabase.rpc("admin_grant_subscription", {
      p_shop: id, p_plan_code: String(body.plan_code ?? ""), p_days: Number.isFinite(days) ? Math.round(days) : 0, p_reason: reason,
    });
    if (error) return refused(error);
  } else {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  logAction(req, user, `admin.shop.${action}`, { id, reason: reason || undefined });
  return NextResponse.json({ ok: true });
}
