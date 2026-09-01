import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { AuctionWithProperty, PropertyType } from "@/lib/types";
import { ExploreView } from "@/components/explore/ExploreView";
import type { ExploreFilter } from "@/components/explore/types";
import { stripAccents } from "@/lib/search";

export const metadata: Metadata = {
  title: "Voitures aux enchères",
  description:
    "Parcourez les voitures en vente aux enchères et en vente directe partout en Tunisie — berlines, SUV, citadines, pick-ups et utilitaires. Mises à prix transparentes sur Mazed Auto.",
  alternates: { canonical: "/fr/properties" },
  openGraph: {
    title: "Voitures aux enchères — Mazed Auto",
    description:
      "Toutes les voitures en vente aux enchères et en vente directe en Tunisie, en un seul endroit.",
    type: "website",
    url: "/fr/properties",
  },
};

const PAGE_SIZE = 12;

const VALID_TYPES: PropertyType[] = [
  "sedan", "suv", "hatchback", "pickup",
  "van", "coupe", "convertible", "wagon", "spare_part",
];

const FUEL_VALUES = ["gasoline", "diesel", "hybrid", "electric"] as const;
const CONDITION_VALUES = ["new", "excellent", "good", "fair", "damaged"] as const;

function cleanEnum(v: string | null | undefined, allowed: readonly string[]): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return allowed.includes(s) ? s : null;
}

type ExploreQueryParams = {
  filter: ExploreFilter;
  types: PropertyType[];
  gov: string | null;
  term: string;
  minPrice: number | null;
  maxPrice: number | null;
  // Car-spec filters (properties.attributes jsonb).
  fuel: string | null;
  condition: string | null;
  minYear: number | null;
  maxYear: number | null;
  maxKm: number | null;
  from: number;
  to: number;
};

/**
 * The catalogue page is the same for every visitor — listings are public
 * (status scheduled/live/extending + property ready) and the saved-heart /
 * login state is filled in client-side after hydration (see WatchlistButton:
 * the server `loggedIn` is only a pre-hydration fallback). So we cache the
 * heavy join+count query per filter-combination for 60s with the cookieless
 * service-role client — exactly the home-feed pattern — instead of running a
 * full DB round-trip + an auth.getUser() on every single visit. At scale this
 * turns the app's second-busiest page from per-request DB work into mostly
 * cache hits.
 */
const getExploreFeed = unstable_cache(
  async (
    p: ExploreQueryParams,
  ): Promise<{ items: AuctionWithProperty[]; totalCount: number }> => {
    const sb = getServiceSupabase();
    if (!sb) return { items: [], totalCount: 0 };

    let q = sb
      .from("auctions")
      .select(
        `
        *,
        property:properties!inner (
          *,
          photos:property_photos (id, storage_path, sort_order, caption)
        )
      `,
        { count: "exact" },
      )
      .in("status", ["scheduled", "live", "extending"])
      .eq("property.status", "ready")
      .order("created_at", { ascending: false })
      .range(p.from, p.to);

    if (p.filter === "auction") q = q.eq("listing_type", "auction");
    else if (p.filter === "direct") q = q.eq("listing_type", "direct");

    if (p.types.length > 0) q = q.in("property.type", p.types);
    if (p.gov) q = q.eq("property.governorate", p.gov);
    if (p.term) {
      // Accent-folded match against the property's search_text generated
      // column (migration 0062) — diacritic-insensitive, trigram-indexed.
      q = q.ilike("property.search_text", `%${stripAccents(p.term)}%`);
    }
    // Car-spec filters in properties.attributes (jsonb). fuel/condition are
    // exact text (->>). year/mileage use single-arrow (->) numeric form so
    // the comparison is numeric, not lexicographic — see the explore route.
    if (p.fuel) q = q.eq("property.attributes->>fuel", p.fuel);
    if (p.condition) q = q.eq("property.attributes->>condition", p.condition);
    if (p.minYear !== null) q = q.gte("property.attributes->year", p.minYear);
    if (p.maxYear !== null) q = q.lte("property.attributes->year", p.maxYear);
    if (p.maxKm !== null) q = q.lte("property.attributes->mileage", p.maxKm);
    // Single coalesced, indexed effective price (0119) — see the explore route.
    if (p.minPrice !== null) q = q.gte("effective_price", p.minPrice);
    if (p.maxPrice !== null) q = q.lte("effective_price", p.maxPrice);

    const res = await q;
    if (res.error) {
      console.error("[/properties] supabase error", res.error);
    }
    const items = (res.data ?? []) as unknown as AuctionWithProperty[];
    return { items, totalCount: res.count ?? items.length };
  },
  ["explore-feed"],
  { revalidate: 60, tags: ["explore-feed"] },
);

/**
 * Explore — paginated listing index.
 *
 * The server fetches page 1 of the catalogue (12 items) plus the total
 * row count, the user's auth state, and the user's saved-auction ids
 * so the heart icon paints filled on first render. The client-side
 * <ExploreView/> takes over from there: filter switching, page jumps
 * (1, 2, 3, …), and view-mode toggle (grid ↔ reels) are all driven
 * through /api/explore.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    types?: string;
    gov?: string;
    q?: string;
    min_price?: string;
    max_price?: string;
    fuel?: string;
    condition?: string;
    min_year?: string;
    max_year?: string;
    max_km?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const initialFilter: ExploreFilter =
    sp.filter === "auction" || sp.filter === "direct" ? sp.filter : "all";

  const types = (sp.types ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is PropertyType => (VALID_TYPES as string[]).includes(s));
  const gov = sp.gov?.trim() || null;
  // Free-text keyword (from the home hero search). Sanitised exactly like
  // /api/explore so a stray comma/paren can't break the PostgREST or().
  const term = (sp.q ?? "").trim().slice(0, 60).replace(/[,()*%]/g, " ").trim();
  const minPrice = numOrNull(sp.min_price);
  const maxPrice = numOrNull(sp.max_price);
  const fuel = cleanEnum(sp.fuel, FUEL_VALUES);
  const condition = cleanEnum(sp.condition, CONDITION_VALUES);
  const minYear = numOrNull(sp.min_year);
  const maxYear = numOrNull(sp.max_year);
  const maxKm = numOrNull(sp.max_km);
  const initialPage = clamp(Number(sp.page ?? 1), 1, 9999);
  const from = (initialPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let items: AuctionWithProperty[] = [];
  let totalCount = 0;
  let totalPages = 1;
  // Filled client-side by the watchlist store; kept empty server-side.
  const savedAuctionIds: string[] = [];

  try {
    const feed = await getExploreFeed({
      filter: initialFilter,
      types,
      gov,
      term,
      minPrice,
      maxPrice,
      fuel,
      condition,
      minYear,
      maxYear,
      maxKm,
      from,
      to,
    });
    items = feed.items;
    totalCount = feed.totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    // Saved-heart + login state are filled in client-side by the shared
    // watchlist store (WatchlistButton + WatchlistSync), so we skip both the
    // per-request watchlist round-trip AND the auth.getUser() here — the
    // catalogue render is now fully shareable + cacheable across users.
  } catch (err) {
    console.warn(
      "[/properties] feed unavailable:",
      err instanceof Error ? err.message : err,
    );
  }

  return (
    <ExploreView
      initialItems={items}
      initialFilter={initialFilter}
      initialPage={initialPage}
      initialTotalPages={totalPages}
      initialTotalCount={totalCount}
      loggedIn={false}
      savedAuctionIds={savedAuctionIds}
      initialSearch={term}
      initialExtra={{
        types,
        gov,
        minPrice,
        maxPrice,
        fuel,
        condition,
        minYear,
        maxYear,
        maxKm,
      }}
    />
  );
}

function numOrNull(v: string | null | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
