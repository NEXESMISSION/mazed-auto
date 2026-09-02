import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

/**
 * GET /api/auctions/<id>/figures — the three numbers a live auction page has to
 * keep honest: current price, offers placed, status.
 *
 * Why a route and not a direct supabase read from the browser: an ANON client
 * cannot read `auctions` at all. The row policy references `properties`, and
 * 0138 revoked `properties` from anon (granting only a display column list), so
 * a logged-out viewer's `select current_price from auctions` fails with
 * "permission denied for table properties". Every client-side price poll would
 * have silently returned nothing for exactly the visitors who see this page
 * most: the ones who aren't signed in.
 *
 * Reads with the service role and returns ONLY what the page already shows in
 * plain text — no owner, no bidder, no reserve.
 *
 * Cached 3s at the edge: a hot lot with 200 viewers polling every 5s collapses
 * to ~1 DB read per 3s, while the number on screen is never more than a few
 * seconds behind the hammer.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("auctions")
    .select("current_price, opening_price, bid_count, status, ends_at")
    .eq("id", id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      price: Number(data.current_price ?? data.opening_price ?? 0),
      bids: Number(data.bid_count ?? 0),
      status: String(data.status),
      endsAt: data.ends_at,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=5",
      },
    },
  );
}
