import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/watchlist
 *
 * Returns the caller's login state and the full set of saved ANNONCE ids.
 * Used by the client watchlist store (src/lib/watchlistStore.ts) to fill in
 * saved-hearts + login state on statically-rendered pages, where the server
 * render can't read cookies. Anonymous callers get { loggedIn: false, ids: [] }.
 *
 * Never cached — it's per-user. The page that calls it is the cached/static
 * surface; this little personalization fetch runs off the critical path.
 */
export async function GET() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ loggedIn: false, ids: [] });

  // LISTING ids, not auction ids.
  //
  // `FavoriteButton` writes through /api/annonces/[id]/favorite, which sets
  // `watchlist.listing_id`. This route kept answering with `auction_id`, so the
  // client store hydrated with a set of ids that could never match a card —
  // every heart stayed empty for signed-in users, and tapping one bounced them
  // to the login page they were already past.
  //
  // `auction_id` is still on the table (nullable, with a check that exactly one
  // subject is set) but nothing writes it now; filtering on a non-null
  // listing_id is both the correct query and a guard against a stale auction
  // row handing back an id the catalogue cannot resolve.
  const { data } = await supabase
    .from("watchlist")
    .select("listing_id")
    .eq("user_id", user.id)
    .not("listing_id", "is", null);

  return NextResponse.json({
    loggedIn: true,
    ids: (data ?? []).map((r) => r.listing_id as string),
  });
}
