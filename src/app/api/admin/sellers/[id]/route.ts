import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * The two things an admin does TO a seller in v3: hand them publications, and
 * grant or pull their badge.
 *
 *   POST { action: "grant_credits", product_id, quota?, note? }
 *   POST { action: "grant_badge",  product_id?, months?, note? }
 *   POST { action: "revoke_badge", reason }
 *
 * Both are deliberately admin actions rather than automatic consequences of a
 * payment:
 *
 *   - Credits are granted here when a seller pays by bank transfer for a pack —
 *     the receipt is validated by a human anyway, so this is where the quota
 *     lands. (The self-serve path in Phase 3 calls the same code after capture.)
 *   - The badge is SOLD but never auto-granted. Someone checks the seller —
 *     papers, a call, a visit — and grants it. That human step is what the badge
 *     means, and it is why removing KYC costs us nothing.
 */

type Body = {
  action?: unknown;
  product_id?: unknown;
  quota?: unknown;
  months?: unknown;
  note?: unknown;
  reason?: unknown;
  payment_id?: unknown;
};

const DEFAULT_CREDIT_MONTHS = 12; // D9
const DEFAULT_BADGE_MONTHS = 12; // D10

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const { id: sellerId } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { data: seller } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller) return NextResponse.json({ error: "seller_not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const action = text(body.action, 32);

  // ── Hand over publications ────────────────────────────────────────────────
  if (action === "grant_credits") {
    const productId = text(body.product_id, 40);
    if (!productId) return NextResponse.json({ error: "product_required" }, { status: 400 });

    const { data: product } = await admin
      .from("products")
      .select("id, kind, listing_quota, name_fr")
      .eq("id", productId)
      .maybeSingle();
    if (!product) return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    if (product.kind !== "listing_pack" && product.kind !== "subscription") {
      return NextResponse.json(
        { error: "not_a_pack", detail: "Ce produit n'accorde pas de publications." },
        { status: 400 },
      );
    }

    // The pack's own quota unless the admin overrides it (a goodwill gesture,
    // a partial delivery — both real, both rare).
    const override = Math.floor(Number(body.quota));
    const quota =
      Number.isFinite(override) && override > 0
        ? Math.min(1000, override)
        : (product.listing_quota as number);

    const expires = new Date();
    expires.setMonth(expires.getMonth() + DEFAULT_CREDIT_MONTHS);

    const { data: credit, error } = await admin
      .from("seller_credits")
      .insert({
        seller_id: sellerId,
        product_id: productId,
        payment_id: text(body.payment_id, 40),
        quota_total: quota,
        expires_at: expires.toISOString(),
        granted_by: user.id,
        note: text(body.note, 300),
      })
      .select("id")
      .single();
    if (error) return fail("credit_grant_failed", 500, error);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: sellerId,
        p_kind: "credits_granted",
        p_title: "Forfait crédité",
        p_body: `${quota} publication(s) ajoutée(s) à votre compte — valables ${DEFAULT_CREDIT_MONTHS} mois.`,
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    logAction(req, user, "admin.credits.grant", { sellerId, productId, quota });
    return NextResponse.json({ ok: true, credit_id: credit.id, quota });
  }

  // ── Grant the badge ───────────────────────────────────────────────────────
  if (action === "grant_badge") {
    const months = Math.floor(Number(body.months));
    const validMonths =
      Number.isFinite(months) && months > 0 ? Math.min(60, months) : DEFAULT_BADGE_MONTHS;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + validMonths);

    // One live badge per seller (unique index in 0158): granting again renews,
    // so retire the current one first rather than failing on the constraint.
    await admin
      .from("seller_badges")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "renewed" })
      .eq("seller_id", sellerId)
      .is("revoked_at", null);

    const { data: badge, error } = await admin
      .from("seller_badges")
      .insert({
        seller_id: sellerId,
        kind: "verified",
        product_id: text(body.product_id, 40),
        payment_id: text(body.payment_id, 40),
        granted_by: user.id,
        expires_at: expires.toISOString(),
        note: text(body.note, 300),
      })
      .select("id, expires_at")
      .single();
    if (error) return fail("badge_grant_failed", 500, error);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: sellerId,
        p_kind: "badge_granted",
        p_title: "Badge « Vendeur vérifié » accordé",
        p_body: `Votre badge est actif jusqu'au ${new Date(badge.expires_at).toLocaleDateString("fr-FR")} et apparaît sur toutes vos annonces.`,
        p_link: "/account",
      })
      .then(() => {}, () => {});

    logAction(req, user, "admin.badge.grant", { sellerId, months: validMonths });
    return NextResponse.json({ ok: true, badge_id: badge.id, expires_at: badge.expires_at });
  }

  // ── Pull it ───────────────────────────────────────────────────────────────
  if (action === "revoke_badge") {
    const reason = text(body.reason, 300);
    if (!reason) {
      return NextResponse.json(
        { error: "reason_required", detail: "Dites pourquoi — c'est ce que verra l'équipe plus tard." },
        { status: 400 },
      );
    }

    const { data: updated, error } = await admin
      .from("seller_badges")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
      .eq("seller_id", sellerId)
      .is("revoked_at", null)
      .select("id");
    if (error) return fail("badge_revoke_failed", 500, error);
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "no_active_badge" }, { status: 409 });
    }

    await admin
      .rpc("enqueue_notification", {
        p_user_id: sellerId,
        p_kind: "badge_revoked",
        p_title: "Badge retiré",
        p_body: `Votre badge « Vendeur vérifié » a été retiré. Motif : ${reason}`,
        p_link: "/account",
      })
      .then(() => {}, () => {});

    logAction(req, user, "admin.badge.revoke", { sellerId, reason });
    return NextResponse.json({ ok: true, revoked: updated.length });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
