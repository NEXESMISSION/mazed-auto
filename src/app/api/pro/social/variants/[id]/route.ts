import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { fail } from "@/lib/http/errors";
import { checkFacts } from "@/lib/social/facts";
import { loadSocialListing } from "@/lib/social/listing";

/**
 * PATCH /api/pro/social/variants/[id] — { body?, hashtags?, validate? }
 *
 * The person edits a text and/or validates it (brief §4: « prévisualiser,
 * modifier et valider chaque contenu »). An edit goes through the same check
 * as a generated text — the person cannot slip in a number the annonce does
 * not give either — and any change withdraws an earlier validation: what is
 * published is exactly what was validated last. Locked once the request has
 * been sent.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin0 = getServiceSupabase();
  if (!admin0) return fail("server_misconfigured", 500);
  const { data: v } = await admin0
    .from("social_content_variants")
    .select("id, body, hashtags, version, request:social_publication_requests (id, shop_id, listing_id, status)")
    .eq("id", id)
    .maybeSingle();
  const request = v ? (Array.isArray(v.request) ? v.request[0] : v.request) as { id: string; shop_id: string; listing_id: string; status: string } | null : null;
  if (!v || !request?.shop_id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gate = await requireShopRole(req, request.shop_id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  if (request.status !== "draft") {
    return NextResponse.json({ error: "locked", detail: "Cette publication est déjà envoyée." }, { status: 409 });
  }

  const input = (await req.json().catch(() => ({}))) as { body?: unknown; hashtags?: unknown; validate?: unknown };
  const body = typeof input.body === "string" ? input.body.trim() : (v.body as string);
  const hashtags = Array.isArray(input.hashtags)
    ? [...new Set(input.hashtags.filter((h): h is string => typeof h === "string")
        .map((h) => `#${h.replace(/^#+/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 2))].slice(0, 15)
    : ((v.hashtags as string[]) ?? []);
  if (body.length < 1 || body.length > 2000) {
    return NextResponse.json({ error: "invalid", detail: "Le texte doit faire entre 1 et 2 000 caractères." }, { status: 400 });
  }

  const listing = await loadSocialListing(gate.admin, request.listing_id);
  if (!listing || listing.status !== "published") {
    return NextResponse.json({ error: "listing_not_published", detail: "L'annonce n'est plus en ligne." }, { status: 409 });
  }
  const check = checkFacts(body, hashtags, listing.facts);
  if (!check.ok) {
    return NextResponse.json({
      error: "facts",
      unknown: check.unknown,
      detail: `Ces chiffres ne figurent pas dans l'annonce : ${check.unknown.join(", ")}. Corrigez le texte ou l'annonce.`,
    }, { status: 400 });
  }

  const changed = body !== v.body || JSON.stringify(hashtags) !== JSON.stringify(v.hashtags);
  const { data: saved, error } = await gate.admin
    .from("social_content_variants")
    .update({
      body, hashtags,
      ...(changed ? { source: "edited", version: (v.version as number) + 1 } : {}),
      validated_at: input.validate === true ? new Date().toISOString() : null,
      validated_by: input.validate === true ? gate.user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, network, body, hashtags, source, version, validated_at")
    .single();
  if (error || !saved) return fail("social_variant_update_failed", 500, error);
  return NextResponse.json(saved);
}
