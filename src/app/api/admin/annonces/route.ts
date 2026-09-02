import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/admin/annonces — publish an annonce ON BEHALF OF a seller.
 *
 * The other half of the brief: a client rings up, or walks in with photos, and
 * we put the car online for them. No payment, no credit — `fee_waived_by`
 * records who comped it, so the revenue reports show the gap instead of hiding
 * it as a free publication.
 *
 * The listing still belongs to the SELLER, not to the admin who typed it:
 * `seller_id` is theirs, the contact details are theirs, and it appears in
 * their "Mes annonces" like any other. Anything else would make the seller
 * unable to renew or edit their own car.
 *
 * Publishing straight past the queue is deliberate here — the admin creating it
 * IS the moderation. `_listings_guard_publish` (0154/0161) allows it because
 * this route runs as the service role.
 */

type Body = {
  seller_id?: unknown;
  category_id?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  price_on_request?: unknown;
  negotiable?: unknown;
  condition?: unknown;
  governorate?: unknown;
  contact_name?: unknown;
  contact_phone?: unknown;
  contact_whatsapp?: unknown;
  attributes?: unknown;
  photos?: unknown;
  fitments?: unknown;
  publish?: unknown;
  note?: unknown;
};

const DEFAULT_DURATION_DAYS = 30;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function phone(v: unknown): string | null {
  const raw = text(v, 24);
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? digits.slice(0, 20) : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const body = (await req.json().catch(() => ({}))) as Body;

  const sellerId = text(body.seller_id, 40);
  const categoryId = text(body.category_id, 40);
  const title = text(body.title, 140);
  const governorate = text(body.governorate, 60);
  if (!sellerId || !categoryId || !title || !governorate) {
    return NextResponse.json(
      { error: "incomplete", detail: "Vendeur, catégorie, titre et gouvernorat sont requis." },
      { status: 400 },
    );
  }

  const { data: seller } = await admin
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller) return NextResponse.json({ error: "seller_not_found" }, { status: 404 });

  const { data: cat } = await admin
    .from("categories")
    .select("id, parent_id, is_active")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat || !cat.is_active || cat.parent_id == null) {
    return NextResponse.json(
      { error: "bad_category", detail: "Choisissez une sous-catégorie active." },
      { status: 400 },
    );
  }

  // Fall back to the seller's own number: an annonce nobody can call is
  // worthless, and the DB refuses to publish one anyway (0154).
  const contactPhone = phone(body.contact_phone) ?? phone(seller.phone);
  const publish = body.publish !== false;
  if (publish && !contactPhone) {
    return NextResponse.json(
      {
        error: "contact_required",
        detail: "Ce vendeur n'a pas de numéro — ajoutez-en un pour publier.",
      },
      { status: 400 },
    );
  }

  const priceOnRequest = body.price_on_request === true;
  const priceNum = Number(body.price);
  const price = Number.isFinite(priceNum) && priceNum >= 0 ? Math.round(priceNum * 100) / 100 : null;
  if (!priceOnRequest && price == null) {
    return NextResponse.json(
      { error: "price_required", detail: "Indiquez un prix, ou cochez « prix sur demande »." },
      { status: 400 },
    );
  }

  const now = new Date();
  const expires = new Date(now.getTime() + DEFAULT_DURATION_DAYS * 86_400_000);
  const condition = text(body.condition, 20);

  const { data: created, error } = await admin
    .from("listings")
    .insert({
      seller_id: sellerId,
      category_id: categoryId,
      title,
      description: text(body.description, 4000),
      price: priceOnRequest ? null : price,
      price_on_request: priceOnRequest,
      negotiable: body.negotiable !== false,
      condition: condition && ["new", "used", "refurbished"].includes(condition) ? condition : "used",
      governorate,
      attributes:
        body.attributes && typeof body.attributes === "object" ? body.attributes : {},
      contact_name: text(body.contact_name, 80) ?? seller.full_name,
      contact_phone: contactPhone,
      contact_whatsapp: phone(body.contact_whatsapp) ?? contactPhone,
      show_phone: true,
      // NOT "v1": that string means the seller personally ticked the sworn
      // accuracy statement, and here they did not — an admin typed the car in
      // from a phone call. Recording their signature would be a false record
      // of exactly the thing the attestation exists to prove. The marker keeps
      // the trigger satisfied while saying truthfully who vouched.
      seller_attestation_version: "v1-admin",
      fee_waived_by: user.id,
      status: publish ? "published" : "pending_review",
      published_at: publish ? now.toISOString() : null,
      expires_at: publish ? expires.toISOString() : null,
      reviewed_by: publish ? user.id : null,
      reviewed_at: publish ? now.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !created) return fail("listing_create_failed", 500, error);
  const listingId = created.id as string;

  if (Array.isArray(body.photos) && body.photos.length > 0) {
    const rows = body.photos
      .slice(0, 12)
      .map((p, i) => {
        const path = text((p as Record<string, unknown>)?.storage_path, 300);
        return path ? { listing_id: listingId, storage_path: path, sort_order: i } : null;
      })
      .filter((r): r is { listing_id: string; storage_path: string; sort_order: number } => r !== null);
    if (rows.length) await admin.from("listing_photos").insert(rows);
  }

  if (Array.isArray(body.fitments) && body.fitments.length > 0) {
    const rows = body.fitments
      .slice(0, 20)
      .map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        const make = text(o.make, 40);
        if (!make) return null;
        const yf = Number(o.year_from);
        const yt = Number(o.year_to);
        return {
          listing_id: listingId,
          make,
          model: text(o.model, 60),
          year_from: Number.isFinite(yf) && yf > 1950 ? Math.floor(yf) : null,
          year_to: Number.isFinite(yt) && yt > 1950 ? Math.floor(yt) : null,
          engine: null,
        };
      })
      .filter((r) => r !== null);
    if (rows.length) await admin.from("listing_fitments").insert(rows);
  }

  // Tell the seller their car is online — they did not do this themselves, so
  // finding it unannounced on the site would be a surprise.
  const { error: notifyError } = await admin
    .rpc("enqueue_notification", {
      p_user_id: sellerId,
      p_kind: publish ? "listing_published" : "listing_submitted",
      p_title: publish ? "Votre annonce est en ligne" : "Annonce créée pour vous",
      p_body: publish
        ? `« ${title} » a été publiée par notre équipe et sera visible jusqu'au ${expires.toLocaleDateString("fr-FR")}.`
        : `« ${title} » a été créée par notre équipe et attend la vérification.`,
      p_link: publish ? `/annonces/${listingId}` : "/account/listings",
    });
  // supabase-js RESOLVES with `{ error }` here rather than rejecting, so a
  // `.then(ok, fallback)` would never see a failure. The listing is already
  // created either way — but a seller who is never told is worth a log line.
  if (notifyError) {
    logAction(req, user, "admin.listing.notify_failed", {
      listingId,
      sellerId,
      msg: notifyError.message,
    });
  }

  logAction(req, user, "admin.listing.create", { listingId, sellerId, publish });
  return NextResponse.json({ ok: true, id: listingId, status: publish ? "published" : "pending_review" });
}
