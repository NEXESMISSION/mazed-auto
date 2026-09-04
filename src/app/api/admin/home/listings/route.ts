import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * Editorial control of the home page.
 *
 * The old /api/admin/home writes promo flags onto `properties` — the
 * auction-era table — so it has had no effect on anything a visitor sees since
 * the pivot. This is its replacement, and it works on the two decisions that
 * were being made by accident:
 *
 *   POST   { listingId, rank, days }  → put an annonce à la une (rank 1 = first)
 *   POST   { listingId, rank: null }  → take it off the home page
 *   PATCH  { listingId, photoId }     → choose the photo that represents it
 *   PUT    { hero_slots, side_slots, fallback } → the shape of the home page
 *
 * Every write busts the home cache tag, so a change is visible on the next
 * render rather than up to 60 s later.
 */

/**
 * The home page is ISR-cached (revalidate = 60) and its hero query is a plain
 * per-request cache(), not an unstable_cache entry — so busting the
 * "home-feed" TAG alone left the rendered page untouched and a change took up
 * to a minute to appear. Editorial changes must be visible on the next load,
 * so the PATH goes too.
 */
function bustHome() {
  revalidateTag("home-feed", "max");
  revalidatePath("/", "layout");
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  if (!listingId) return NextResponse.json({ error: "listing_required" }, { status: 400 });

  const rawRank = body.rank;
  const rank =
    rawRank === null || rawRank === undefined
      ? null
      : Math.max(1, Math.min(50, Math.floor(Number(rawRank) || 1)));
  const days = Math.max(0, Math.min(365, Math.floor(Number(body.days ?? 0) || 0)));

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { error } = await admin
    .from("listings")
    .update({
      featured_rank: rank,
      featured_until: rank === null || days === 0
        ? null
        : new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .eq("id", listingId);
  if (error) return fail("feature_failed", 500, error);

  logAction(req, gate.user, rank === null ? "home.unfeature" : "home.feature", { listingId, rank, days });
  bustHome();
  return NextResponse.json({ ok: true, rank });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const photoId = typeof body.photoId === "string" ? body.photoId : "";
  if (!listingId || !photoId) {
    return NextResponse.json({ error: "listing_and_photo_required" }, { status: 400 });
  }

  // The RPC does both writes (clear the old cover, set the new one) in one
  // statement pair and re-checks is_admin() itself, so the "exactly one cover"
  // rule cannot be broken by a half-applied change. It runs as the ADMIN's
  // session, not service-role, because that is what its guard reads.
  const { error } = await gate.supabase.rpc("admin_set_listing_cover", {
    p_listing: listingId,
    p_photo: photoId,
  });
  if (error) return fail("set_cover_failed", 500, error);

  logAction(req, gate.user, "home.set_cover", { listingId, photoId });
  bustHome();
  revalidateTag("explore-feed", "max");
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const value = {
    hero_slots: clamp(body.hero_slots, 0, 3, 1),
    side_slots: clamp(body.side_slots, 0, 8, 3),
    fallback: body.fallback === "viewed" ? "viewed" : "recent",
  };

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "home_layout", value }, { onConflict: "key" });
  if (error) return fail("save_failed", 500, error);

  logAction(req, gate.user, "home.layout", value);
  bustHome();
  return NextResponse.json({ ok: true, value });
}
