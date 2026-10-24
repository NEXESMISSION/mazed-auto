import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { overLimit, tooMany } from "@/lib/http/rateLimit";
import { fail } from "@/lib/http/errors";
import { logAction } from "@/lib/activity";
import { socialGate, shopMayUseAi } from "@/lib/social/gate";
import { loadSocialListing } from "@/lib/social/listing";
import { generateDraft } from "@/lib/social/content";
import { prepareMedia } from "@/lib/social/media";
import { socialLink, type SocialNetwork } from "@/lib/social/utm";
import type { Language } from "@/lib/social/templates";

/**
 * POST /api/pro/social/requests — { listing_id, networks: ["facebook" | "instagram"], language: "fr" | "tn" }
 *
 * Starts a publication for one of the shop's online annonces: a draft text per
 * network (written by the model when the plan allows it, else the template —
 * always checked against the annonce) and the annonce's own photos prepared
 * for each network. Nothing is published here and nothing is validated: the
 * person reads, edits and validates each text next. Owner or manager.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { listing_id?: unknown; networks?: unknown; language?: unknown };
  const listingId = typeof body.listing_id === "string" ? body.listing_id : "";
  const networks = [...new Set(Array.isArray(body.networks) ? body.networks : [])]
    .filter((n): n is SocialNetwork => n === "facebook" || n === "instagram");
  const language: Language = body.language === "tn" ? "tn" : "fr";
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || networks.length === 0) {
    return NextResponse.json({ error: "bad_request", detail: "Choisissez une annonce et au moins un réseau." }, { status: 400 });
  }

  const admin0 = getServiceSupabase();
  if (!admin0) return fail("server_misconfigured", 500);
  const listing = await loadSocialListing(admin0, listingId);
  if (!listing?.shopId) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });

  const gate = await requireShopRole(req, listing.shopId, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { admin, user } = gate;
  if (!(await socialGate(admin)).visible) return NextResponse.json({ error: "not_available" }, { status: 404 });
  if (listing.status !== "published") {
    return NextResponse.json({ error: "listing_not_published", detail: "Seule une annonce en ligne peut être diffusée." }, { status: 409 });
  }
  // Each request may call the model twice per network.
  if (await overLimit(admin, `social_generate:${user.id}`, 30, 3600)) return tooMany();

  const { data: request, error } = await admin
    .from("social_publication_requests")
    .insert({ listing_id: listing.id, shop_id: listing.shopId, requested_by: user.id, networks, language })
    .select("id")
    .single();
  if (error || !request) return fail("social_request_failed", 500, error);

  const allowAi = await shopMayUseAi(admin, listing.shopId);
  const variants = [];
  for (const network of networks) {
    const [gen, media] = await Promise.all([
      generateDraft(listing.facts, network, language, allowAi),
      prepareMedia(admin, listing.photos, request.id as string, network),
    ]);
    const { data: v, error: vErr } = await admin
      .from("social_content_variants")
      .insert({
        request_id: request.id, network, body: gen.draft.body, hashtags: gen.draft.hashtags,
        media, link_url: socialLink(listing.id, network), source: gen.source, model: gen.model,
      })
      .select("id, network, body, hashtags, media, source, version")
      .single();
    if (vErr || !v) return fail("social_variant_failed", 500, vErr);
    variants.push({ ...v, note: gen.note });
  }

  logAction(req, user, "social.request", { requestId: request.id, listingId: listing.id, networks, language });
  return NextResponse.json({ id: request.id, ai: allowAi, variants });
}
