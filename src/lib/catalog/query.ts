import { CONDITIONS, FUELS, TRANSMISSIONS } from "@/lib/vehicles";

/**
 * The catalog query, in one place.
 *
 * `/annonces` builds this filter chain twice already — once for the page of
 * cards and once for the `count` — and the file says why: "so the total can
 * never describe a different set than the cards shown". The reels feed is a
 * THIRD reader of the same catalog, and it pages from an API route rather than
 * from the page component, so the chain had to leave the page module or be
 * copied into it. Copied, it drifts: the day someone adds a filter to the grid
 * and not to the feed, scrolling a reel silently shows cars the filters
 * excluded, and nothing fails loudly enough to notice.
 */

export type CatalogSearchParams = {
  kind?: string;        // vehicle | part
  cat?: string;         // category id
  gov?: string;
  q?: string;
  make?: string;
  model?: string;
  year?: string;
  min?: string;
  max?: string;
  fuel?: string;
  etat?: string;
  year_min?: string;
  year_max?: string;
  km_max?: string;
  boite?: string;
  sort?: string;
  page?: string;
  /** "reels" switches the catalog from a grid of cards to the vertical feed. */
  view?: string;
};

/** Every filter key that must survive paging and view switches. */
export const FILTER_KEYS = [
  "kind", "cat", "gov", "q", "make", "model", "year",
  "min", "max", "fuel", "boite", "etat", "sort",
  "year_min", "year_max", "km_max",
] as const;

/**
 * How many annonces a feed page holds.
 *
 * Exported because BOTH readers need it: the page renders the first slice
 * server-side, and /api/annonces/feed returns every slice after it. A grid
 * page of 24 followed by an API page of 12 would re-serve rows 13-24 as
 * "page 2" and the feed would repeat itself.
 */
export const FEED_PAGE_SIZE = 12;

export const LISTING_SELECT = `id, title, price, price_on_request, negotiable, governorate,
     condition, published_at, seller_id, attributes,
     category:categories (label_fr, kind),
     photos:listing_photos (storage_path, sort_order, is_cover)`;

export type ListingRow = {
  id: string; title: string; price: number | null; price_on_request: boolean;
  negotiable: boolean; governorate: string; condition: string | null;
  published_at: string | null; seller_id: string;
  attributes: Record<string, unknown> | null;
  category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

/** PostgREST returns an embedded to-one as an object or a one-element array. */
export const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** The subset of the Supabase query builder these filters touch. */
type Filterable = {
  eq: (column: string, value: unknown) => Filterable;
  in: (column: string, values: readonly unknown[]) => Filterable;
  ilike: (column: string, pattern: string) => Filterable;
  lte: (column: string, value: unknown) => Filterable;
  gte: (column: string, value: unknown) => Filterable;
  contains: (column: string, value: unknown) => Filterable;
  filter: (column: string, operator: string, value: unknown) => Filterable;
};

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function normalizeKind(raw: string | undefined): "vehicle" | "part" | null {
  return raw === "part" || raw === "vehicle" ? raw : null;
}

/**
 * Apply every catalog filter to a query builder.
 *
 * `visibleCatIds` and `fitmentIds` are resolved by the caller because both
 * need their own database reads — the category tree (cached) and, for parts,
 * the compatibility join. `fitmentIds` of `[]` means "a fitment filter ran and
 * matched nothing", which is not the same as `null` ("no fitment filter").
 */
export function applyCatalogFilters<T>(
  builder: T,
  sp: CatalogSearchParams,
  opts: { visibleCatIds: string[]; fitmentIds: string[] | null },
): T {
  const kind = normalizeKind(sp.kind);
  let q = builder as Filterable;

  if (sp.cat) q = q.eq("category_id", sp.cat);
  else if (kind) q = q.in("category_id", opts.visibleCatIds);

  if (sp.gov) q = q.eq("governorate", sp.gov);
  if (sp.q) q = q.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
  if (sp.min && Number(sp.min) > 0) q = q.gte("price", Number(sp.min));
  if (sp.max && Number(sp.max) > 0) q = q.lte("price", Number(sp.max));

  // Ranges over the jsonb the seller filled in. `->` (not `->>`) keeps the
  // comparison numeric — as text, "9" would sort after "10 000".
  const yMin = num(sp.year_min), yMax = num(sp.year_max), kMax = num(sp.km_max);
  if (yMin) q = q.filter("attributes->year", "gte", yMin);
  if (yMax) q = q.filter("attributes->year", "lte", yMax);
  if (kMax) q = q.filter("attributes->mileage", "lte", kMax);

  // Spec filters are jsonb @> matches, answered by the GIN index added in 0179.
  if (sp.fuel) q = q.contains("attributes", { fuel: sp.fuel });
  if (sp.etat) q = q.contains("attributes", { condition: sp.etat });
  if (sp.boite) q = q.contains("attributes", { transmission: sp.boite });

  // `make` means two different things depending on what you are browsing. On a
  // PART it is compatibility, resolved through listing_fitments by the caller.
  // On a VEHICLE it is the car's own marque, which lives in the attributes the
  // seller filled in.
  if (opts.fitmentIds) {
    if (opts.fitmentIds.length === 0) q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    else q = q.in("id", opts.fitmentIds);
  } else if (sp.make) {
    q = q.contains("attributes", { make: sp.make });
    if (sp.model) q = q.contains("attributes", { model: sp.model });
  }

  return q as T;
}

/** Sorting by price puts "prix sur demande" (null) last either way. */
export function sortFor(sp: CatalogSearchParams) {
  const column = sp.sort === "price_asc" || sp.sort === "price_desc" ? "price" : "published_at";
  return { column, ascending: sp.sort === "price_asc" };
}

// ──────────────────────────────────────────────────────────────────────────
// The reel
// ──────────────────────────────────────────────────────────────────────────

/**
 * One card in the vertical feed.
 *
 * Flattened on the SERVER, by `toReelItem` below, and used unchanged by both
 * the first page (rendered into the page) and every page after it (fetched
 * from /api/annonces/feed). One mapper means a reel that arrives by scrolling
 * cannot look different from one that arrived with the document.
 */
export type ReelItem = {
  id: string;
  title: string;
  price: number | null;
  priceOnRequest: boolean;
  negotiable: boolean;
  governorate: string;
  categoryLabel: string;
  isPart: boolean;
  /** The three or four facts a buyer scans: year, km, fuel, gearbox. */
  specs: string[];
  /** Storage paths, cover first — the reel swipes through these. */
  photos: string[];
  sellerVerified: boolean;
};

export function toReelItem(l: ListingRow, verifiedSellers: Set<string>): ReelItem {
  const cat = one(l.category);
  const isPart = cat?.kind === "part";
  const at = (l.attributes ?? {}) as Record<string, unknown>;

  const specs: string[] = [];
  if (!isPart) {
    const year = String(at.year ?? "").trim();
    const km = Number(at.mileage);
    const fuel = FUELS.find((x) => x.value === at.fuel)?.label;
    const box = TRANSMISSIONS.find((x) => x.value === at.transmission)?.label;
    if (year) specs.push(year);
    if (Number.isFinite(km) && km > 0) specs.push(`${Intl.NumberFormat("fr-FR").format(km)} km`);
    if (fuel) specs.push(fuel);
    if (box) specs.push(box);
  } else {
    const brand = String(at.brand ?? "").trim();
    const cond = CONDITIONS.find((c) => c.value === l.condition)?.label;
    if (brand) specs.push(brand);
    if (cond) specs.push(cond);
  }

  // Cover first, then the seller's order. The admin-picked cover is what the
  // grid shows, so the reel opens on the same picture the card promised.
  const sorted = (l.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const cover = sorted.find((p) => p.is_cover);
  const photos = cover
    ? [cover.storage_path, ...sorted.filter((p) => p !== cover).map((p) => p.storage_path)]
    : sorted.map((p) => p.storage_path);

  return {
    id: l.id,
    title: l.title,
    price: l.price == null ? null : Number(l.price),
    priceOnRequest: l.price_on_request,
    negotiable: l.negotiable,
    governorate: l.governorate,
    categoryLabel: cat?.label_fr ?? "",
    isPart,
    specs,
    photos,
    sellerVerified: verifiedSellers.has(l.seller_id),
  };
}
