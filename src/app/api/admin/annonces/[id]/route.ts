import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * Moderation, and the only door to `published`.
 *
 *   POST { action: "approve" }            → live for `duration_days`
 *   POST { action: "reject", reason }     → back to the seller, credit returned
 *   POST { action: "archive" }            → taken down, no refund
 *
 * Approving is where a listing gets its `published_at` / `expires_at`, taken
 * from the product that paid for it — so changing the standard duration in
 * Tarifs changes the next publication, with no code involved.
 *
 * Rejecting RETURNS THE CREDIT. A seller whose listing is refused has not had a
 * publication; charging them for our "no" would be indefensible, and they will
 * (rightly) ask for it back.
 */

const DEFAULT_DURATION_DAYS = 30;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const { id } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    reason?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "";

  const { data: listing } = await admin
    .from("listings")
    .select("id, seller_id, title, status, seller_credit_id, fee_payment_id, contact_phone")
    .eq("id", id)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  // ── Approve ───────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!listing.contact_phone) {
      return NextResponse.json(
        { error: "contact_required", detail: "Cette annonce n'a pas de numéro : elle ne peut pas être publiée." },
        { status: 400 },
      );
    }

    // How long it stays up comes from the product that paid for it.
    let days = DEFAULT_DURATION_DAYS;
    if (listing.fee_payment_id) {
      const { data: pay } = await admin
        .from("payments")
        .select("metadata")
        .eq("id", listing.fee_payment_id)
        .maybeSingle();
      const d = Number((pay?.metadata as { duration_days?: unknown } | null)?.duration_days);
      if (Number.isFinite(d) && d > 0) days = d;
    } else {
      const { data: prod } = await admin
        .from("products")
        .select("duration_days")
        .eq("kind", "listing_single")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      const d = Number(prod?.duration_days);
      if (Number.isFinite(d) && d > 0) days = d;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + days * 86_400_000);

    const { error } = await admin
      .from("listings")
      .update({
        status: "published",
        published_at: now.toISOString(),
        expires_at: expires.toISOString(),
        reviewed_by: user.id,
        reviewed_at: now.toISOString(),
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return fail("listing_publish_failed", 500, error);

    await admin
      .rpc("enqueue_notification", {
        p_user_id: listing.seller_id,
        p_kind: "listing_published",
        p_title: "Votre annonce est en ligne",
        p_body: `« ${listing.title} » est visible jusqu'au ${expires.toLocaleDateString("fr-FR")}.`,
        p_link: `/annonces/${id}`,
      })
      .then(() => {}, () => {});

    logAction(req, user, "admin.listing.approve", { id, days });
    return NextResponse.json({ ok: true, status: "published", expires_at: expires.toISOString() });
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  if (action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) {
      return NextResponse.json(
        { error: "reason_required", detail: "Dites au vendeur ce qui ne va pas — sinon il renverra la même annonce." },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("listings")
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return fail("listing_reject_failed", 500, error);

    // Give the publication back. Our refusal is not a publication.
    let creditReturned = false;
    if (listing.seller_credit_id) {
      const { data: ret } = await admin.rpc("return_listing_credit", {
        p_listing: id,
        p_actor: user.id,
        p_reason: "moderation_rejected",
      });
      creditReturned = ret?.ok === true;
    }

    await admin
      .rpc("enqueue_notification", {
        p_user_id: listing.seller_id,
        p_kind: "listing_rejected",
        p_title: "Annonce à corriger",
        p_body:
          `« ${listing.title} » n'a pas été publiée. Motif : ${reason}` +
          (creditReturned ? " Votre publication vous a été rendue." : ""),
        p_link: "/account/listings",
      })
      .then(() => {}, () => {});

    logAction(req, user, "admin.listing.reject", { id, creditReturned });
    return NextResponse.json({ ok: true, status: "rejected", creditReturned });
  }

  // ── Archive ───────────────────────────────────────────────────────────────
  if (action === "archive") {
    const { error } = await admin
      .from("listings")
      .update({ status: "archived", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return fail("listing_archive_failed", 500, error);

    logAction(req, user, "admin.listing.archive", { id });
    return NextResponse.json({ ok: true, status: "archived" });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
