import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { listingIdsMatching } from "@/lib/fitment";
import {
  applyCatalogFilters,
  LISTING_SELECT,
  normalizeKind,
  sortFor,
  toReelItem,
  FEED_PAGE_SIZE,
  type CatalogSearchParams,
  type ListingRow,
} from "@/lib/catalog/query";

/**
 * GET /api/annonces/feed — one page of the vertical (reels) catalog.
 *
 * The grid pages by reloading the route with `?page=`. A feed cannot: the
 * whole point of it is that the next card is already there when you flick past
 * the current one, and a navigation would throw away the scroll position and
 * every photo already decoded.
 *
 * It takes the SAME query string the page does and runs it through the SAME
 * filter chain (`applyCatalogFilters`), so a reel that arrives by scrolling
 * comes out of the identical result set as the ones that arrived with the
 * document. Read-only, published rows only, no user data in the response
 * beyond what /annonces already renders to anonymous visitors — so it needs no
 * session and is safe to cache per-URL at the edge.
 */

export const dynamic = "force-dynamic";

/** A ceiling on how deep a client can page, so this cannot be walked forever. */
const MAX_PAGE = 200;

export async function GET(req: NextRequest) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const url = req.nextUrl.searchParams;
  const sp: CatalogSearchParams = {};
  for (const [k, v] of url.entries()) {
    if (v) (sp as Record<string, string>)[k] = v;
  }

  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(sp.page)) || 1));
  const kind = normalizeKind(sp.kind);

  // The category tree, only when a `kind` narrows by it. Same read the page
  // does; it is reference data and Supabase's own cache absorbs the repeat.
  let visibleCatIds: string[] = [];
  if (kind && !sp.cat) {
    const { data } = await admin
      .from("categories")
      .select("id, parent_id, kind")
      .eq("is_active", true);
    visibleCatIds = (data ?? [])
      .filter((c) => c.parent_id != null && c.kind === kind)
      .map((c) => c.id as string);
  }

  // Parts compatibility, resolved exactly as the page resolves it — the coarse
  // filter in SQL, the real rule in src/lib/fitment.ts.
  let fitmentIds: string[] | null = null;
  if (sp.make && kind === "part") {
    const { data: fits } = await admin
      .from("listing_fitments")
      .select("listing_id, make, model, year_from, year_to")
      .ilike("make", sp.make.trim())
      .limit(1000);
    fitmentIds = listingIdsMatching(
      (fits ?? []).map((f) => ({
        listingId: f.listing_id as string,
        make: f.make as string,
        model: (f.model as string | null) ?? null,
        yearFrom: (f.year_from as number | null) ?? null,
        yearTo: (f.year_to as number | null) ?? null,
      })),
      { make: sp.make, model: sp.model, year: sp.year },
    );
  }

  const sort = sortFor(sp);
  const offset = (page - 1) * FEED_PAGE_SIZE;

  const { data, count, error } = await applyCatalogFilters(
    admin
      .from("listings")
      .select(LISTING_SELECT, { count: "exact" })
      .eq("status", "published")
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .range(offset, offset + FEED_PAGE_SIZE - 1),
    sp,
    { visibleCatIds, fitmentIds },
  );

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as ListingRow[];

  // The verified badge, and which of these the viewer has already saved. Both
  // are per-page reads over the ids just returned, so they cost one round trip
  // each regardless of how deep the feed goes.
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const client = await getServerSupabase();

  // Resolved before the two reads rather than inside one of them: a ternary
  // that yields either a query builder or a plain object gives Promise.all
  // nothing to unify, and the "thenable vs response" mismatch is a type error
  // rather than a runtime one only because the builder happens to be a
  // thenable too.
  const { data: auth } = await client.auth.getUser();
  const viewerId = auth.user?.id ?? null;

  const [badgeRes, savedRes] = await Promise.all([
    sellerIds.length > 0
      ? admin
          .from("seller_badges")
          .select("seller_id, expires_at")
          .in("seller_id", sellerIds)
          .is("revoked_at", null)
      : Promise.resolve({ data: null }),
    // Through the viewer's own session, so RLS decides what they can see.
    viewerId && rows.length > 0
      ? client
          .from("watchlist")
          .select("listing_id")
          .eq("user_id", viewerId)
          .in("listing_id", rows.map((r) => r.id))
      : Promise.resolve({ data: null }),
  ]);

  const now = Date.now();
  const verified = new Set<string>();
  for (const b of (badgeRes.data ?? []) as { seller_id: string; expires_at: string }[]) {
    if (new Date(b.expires_at).getTime() > now) verified.add(b.seller_id);
  }

  const saved: string[] = [];
  for (const w of (savedRes.data ?? []) as { listing_id: string | null }[]) {
    if (w.listing_id) saved.push(w.listing_id);
  }

  const total = count ?? rows.length;
  const hasMore = page < MAX_PAGE && offset + rows.length < total;

  return NextResponse.json({
    items: rows.map((r) => toReelItem(r, verified)),
    saved,
    total,
    page,
    nextPage: hasMore ? page + 1 : null,
  });
}
