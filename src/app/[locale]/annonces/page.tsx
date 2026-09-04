import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import { listingIdsMatching } from "@/lib/fitment";
import { CatalogSidebar, CatalogToolbar } from "./CatalogFilters";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { getServerSupabase } from "@/lib/supabase/server";
import { BadgeCheck, ImageOff, Images, MapPin, SearchX, Wrench, Car } from "lucide-react";
import { CONDITIONS, FUELS, TRANSMISSIONS } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

/**
 * Toutes les annonces — the catalog.
 *
 * Two things make this page different from the v2 explore grid:
 *
 *   1. It covers TWO kinds of thing. The category switch (Véhicules ⇄ Pièces)
 *      is the first control, because a buyer is looking for one or the other,
 *      never both.
 *   2. It answers the parts question directly: "des plaquettes pour ma Clio 5
 *      de 2020". `listing_fitments` is joined and filtered on make/model/year,
 *      which no amount of full-text search over a description does reliably.
 */

type SearchParams = {
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
  boite?: string;
  sort?: string;
  page?: string;
};

/**
 * The catalog pages rather than truncating. It used to `.limit(60)` and print
 * `rows.length` as the total — which was invisible while the catalog held a
 * handful of cars, and became two bugs the moment it filled up: the count
 * under-reported the real number, and everything past the 60th listing was
 * unreachable because nothing linked to it.
 */
const PAGE_SIZE = 24;

type ListingRow = {
  id: string; title: string; price: number | null; price_on_request: boolean;
  negotiable: boolean; governorate: string; condition: string | null;
  published_at: string | null; seller_id: string;
  attributes: Record<string, unknown> | null;
  category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
  photos: { storage_path: string; sort_order: number }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function AnnoncesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const admin = getServiceSupabase();

  if (!admin) {
    return <main className="px-4 py-16 text-center text-[13px] text-muted">Service indisponible.</main>;
  }

  const { data: catRows } = await admin
    .from("categories")
    .select("id, parent_id, label_fr, kind, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  type Cat = { id: string; parent_id: string | null; label_fr: string; kind: string };
  const cats = (catRows ?? []) as Cat[];
  const leaves = cats.filter((c) => c.parent_id != null);

  const kind = sp.kind === "part" || sp.kind === "vehicle" ? sp.kind : null;
  const visibleCats = kind ? leaves.filter((c) => c.kind === kind) : leaves;

  // ── Fitment first: it narrows the set before anything else does ──────────
  // The DB query is a coarse filter (make, roughly the model); the exact rule —
  // accent folding, model matching in either direction, open-ended year ranges
  // — lives in src/lib/fitment.ts, where it is unit-tested. Two places deciding
  // what "compatible" means is how a buyer ends up with parts for another car.
  let fitmentIds: string[] | null = null;
  if (sp.make) {
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

  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const LISTING_SELECT = `id, title, price, price_on_request, negotiable, governorate,
     condition, published_at, seller_id, attributes,
     category:categories (label_fr, kind),
     photos:listing_photos (storage_path, sort_order)`;

  /** The subset of the query builder these filters need. */
  type Filterable = {
    eq: (column: string, value: unknown) => Filterable;
    in: (column: string, values: readonly unknown[]) => Filterable;
    ilike: (column: string, pattern: string) => Filterable;
    lte: (column: string, value: unknown) => Filterable;
    gte: (column: string, value: unknown) => Filterable;
    contains: (column: string, value: unknown) => Filterable;
  };

  // One filter chain, applied to both the page read and the count-only read,
  // so the total can never describe a different set than the cards shown.
  function applyFilters<T>(builder: T): T {
    let q = builder as Filterable;
    if (sp.cat) q = q.eq("category_id", sp.cat);
    else if (kind) q = q.in("category_id", visibleCats.map((c) => c.id));
    if (sp.gov) q = q.eq("governorate", sp.gov);
    if (sp.q) q = q.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
    if (sp.min && Number(sp.min) > 0) q = q.gte("price", Number(sp.min));
    if (sp.max && Number(sp.max) > 0) q = q.lte("price", Number(sp.max));
    // Spec filters live in the jsonb the seller filled in. `contains` is an
    // index-friendly @> rather than a text match on a rendered value.
    if (sp.fuel) q = q.contains("attributes", { fuel: sp.fuel });
    if (sp.boite) q = q.contains("attributes", { transmission: sp.boite });
    if (fitmentIds) {
      // No fitment matched → no results, without a pointless second query.
      if (fitmentIds.length === 0) q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      else q = q.in("id", fitmentIds);
    }
    return q as T;
  }

  // Sorting by price puts "prix sur demande" (null) last either way — a row
  // with no price is not the cheapest car on the site.
  const sortColumn = sp.sort === "price_asc" || sp.sort === "price_desc" ? "price" : "published_at";
  const sortAsc = sp.sort === "price_asc";

  const pagedQuery = (offset: number) =>
    applyFilters(
      admin
        .from("listings")
        .select(LISTING_SELECT, { count: "exact" })
        .eq("status", "published")
        .order(sortColumn, { ascending: sortAsc, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1),
    );

  const countQuery = () =>
    applyFilters(
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    );

  const { data, count } = await pagedQuery((page - 1) * PAGE_SIZE);
  let rows = (data ?? []) as ListingRow[];
  let total = count ?? rows.length;

  // A page past the end — a stale bookmark, or narrowing a filter while on
  // page 3 — must not read as "Aucune annonce ne correspond." when there are
  // matches. PostgREST answers an out-of-range slice with no rows AND no
  // count, so the real total has to be asked for separately before we can
  // fall back to the last real page. Both extra reads only ever happen on a
  // URL that is already wrong.
  if (rows.length === 0 && page > 1) {
    const { count: realTotal } = await countQuery();
    total = realTotal ?? 0;
    if (total > 0) {
      const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const { data: clamped } = await pagedQuery((last - 1) * PAGE_SIZE);
      rows = (clamped ?? []) as ListingRow[];
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shownPage = Math.min(page, lastPage);

  // Paging must carry the active filters, or "Suivant" quietly drops the
  // buyer back into the unfiltered catalog. Empty values are left out so the
  // URL stays readable.
  const pageQuery: Record<string, string> = {};
  for (const k of [
    "kind", "cat", "gov", "q", "make", "model", "year",
    "min", "max", "fuel", "boite", "sort",
  ] as const) {
    const v = sp[k];
    if (v) pageQuery[k] = v;
  }

  // Which of these the viewer already saved — one read, through their own
  // session so RLS decides what they can see.
  const userClient = await getServerSupabase();
  const { data: { user } } = await userClient.auth.getUser();
  const savedIds = new Set<string>();
  if (user && rows.length > 0) {
    const { data: saved } = await userClient
      .from("watchlist")
      .select("listing_id")
      .eq("user_id", user.id)
      .in("listing_id", rows.map((r) => r.id));
    for (const w of saved ?? []) if (w.listing_id) savedIds.add(w.listing_id as string);
  }

  // Badges in one round-trip rather than one per card.
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const badged = new Set<string>();
  if (sellerIds.length > 0) {
    const { data: badges } = await admin
      .from("seller_badges")
      .select("seller_id, expires_at, revoked_at")
      .in("seller_id", sellerIds)
      .is("revoked_at", null);
    const now = Date.now();
    for (const b of badges ?? []) {
      if (new Date(b.expires_at as string).getTime() > now) badged.add(b.seller_id as string);
    }
  }

  const filterState = {
    kind: kind ?? "", cat: sp.cat ?? "", gov: sp.gov ?? "", q: sp.q ?? "",
    make: sp.make ?? "", model: sp.model ?? "", year: sp.year ?? "",
    min: sp.min ?? "", max: sp.max ?? "", fuel: sp.fuel ?? "",
    boite: sp.boite ?? "", sort: sp.sort ?? "",
  };
  const filterProps = {
    categories: visibleCats.map((c) => ({ id: c.id, label: c.label_fr, kind: c.kind })),
    governorates: [...GOVERNORATES],
    current: filterState,
  };

  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 py-5 lg:px-6 lg:py-8">
      <header className="lg:mb-6">
        <h1 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">Annonces</h1>
        <p className="mt-1 text-[13px] text-muted">
          Voitures et pi&egrave;ces de rechange. Le prix est affich&eacute;, vous appelez le vendeur.
        </p>
      </header>

      {/* Rail beside the results on desktop. On a phone the rail becomes a
          sheet and this collapses to one column. */}
      <div className="mt-5 lg:mt-0 lg:grid lg:grid-cols-[272px_1fr] lg:gap-7">
        <CatalogSidebar {...filterProps} />

        <div className="min-w-0">
          <CatalogToolbar {...filterProps} total={total} />

          {rows.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface text-muted">
                <SearchX className="size-6" />
              </span>
              <p className="mt-4 text-[15px] font-bold text-foreground">
                Aucune annonce ne correspond
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                &Eacute;largissez le budget ou le gouvernorat, ou retirez un filtre ci-dessus.
              </p>
              <Link
                href={"/annonces" as never}
                className="batta-btn-luxe tap-target mt-5 inline-flex px-5 py-2.5 text-[13px]"
              >
                Voir toutes les annonces
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-4">
              {rows.map((l) => {
                const cat = one(l.category);
                const photos = (l.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
                const cover = photos[0];
                const at = (l.attributes ?? {}) as Record<string, unknown>;
                const isPart = cat?.kind === "part";

                // The line every classifieds card has and this one did not:
                // what the thing actually is, in the three or four facts a
                // buyer scans before deciding to open it.
                const specs: string[] = [];
                if (!isPart) {
                  const year = String(at.year ?? "").trim();
                  const km = Number(at.mileage);
                  const fuel = FUELS.find((x) => x.value === at.fuel)?.label;
                  const box = TRANSMISSIONS.find((x) => x.value === at.transmission)?.label;
                  if (year) specs.push(year);
                  if (Number.isFinite(km) && km > 0) {
                    specs.push(`${Intl.NumberFormat("fr-FR").format(km)} km`);
                  }
                  if (fuel) specs.push(fuel);
                  if (box) specs.push(box);
                } else {
                  const brand = String(at.brand ?? "").trim();
                  const cond = CONDITIONS.find((c) => c.value === l.condition)?.label;
                  if (brand) specs.push(brand);
                  if (cond) specs.push(cond);
                }

                return (
                  <Link
                    key={l.id}
                    href={`/annonces/${l.id}` as never}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-gold-soft hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.6)]"
                  >
                    <div className="relative aspect-[4/3] bg-surface-2">
                      {cover ? (
                        <ListingImage
                          path={cover.storage_path}
                          alt={l.title}
                          sizes="(min-width:1280px) 22vw, (min-width:1024px) 28vw, (min-width:640px) 33vw, 50vw"
                          className="transition group-hover:scale-[1.02]"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-muted">
                          <ImageOff className="size-6" />
                        </span>
                      )}

                      {badged.has(l.seller_id) && (
                        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
                          <BadgeCheck className="size-3 text-gold" /> v&eacute;rifi&eacute;
                        </span>
                      )}

                      {/* Photo count, the way every listing site shows it: it
                          tells you whether the seller bothered. */}
                      {photos.length > 1 && (
                        <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                          <Images className="size-3" /> {photos.length}
                        </span>
                      )}

                      <div className="absolute end-2 top-2">
                        <FavoriteButton
                          listingId={l.id}
                          initialSaved={savedIds.has(l.id)}
                          loggedIn={user !== null}
                          size="sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                        {isPart ? <Wrench className="size-3" /> : <Car className="size-3" />}
                        {cat?.label_fr ?? ""}
                      </span>

                      <h2 className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground">
                        {l.title}
                      </h2>

                      {specs.length > 0 && (
                        // Two facts on a phone, three from sm up. A card this
                        // narrow truncates the third mid-word ("Dies\u2026"), which
                        // reads as broken rather than as "there is more".
                        <p className="mt-1 line-clamp-1 text-[11.5px] text-muted">
                          {specs.slice(0, 3).map((sp, i) => (
                            <span key={sp} className={i > 1 ? "hidden sm:inline" : undefined}>
                              {i > 0 ? " \u00b7 " : ""}
                              {sp}
                            </span>
                          ))}
                        </p>
                      )}

                      <p className="batta-tabular mt-auto pt-2 text-[15px] font-extrabold text-gold">
                        {l.price_on_request || l.price == null
                          ? "Sur demande"
                          : `${formatTND(Number(l.price), locale)} TND`}
                      </p>

                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                        <MapPin className="size-3" /> {l.governorate}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

      {lastPage > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
          {shownPage > 1 && (
            <Link
              href={{ pathname: "/annonces", query: { ...pageQuery, page: String(shownPage - 1) } }}
              className="rounded-full bg-surface px-4 py-2 text-[12.5px] font-bold text-foreground ring-1 ring-border hover:text-gold"
            >
              Précédent
            </Link>
          )}
          <span className="batta-tabular text-[12.5px] text-muted">
            {shownPage} / {lastPage}
          </span>
          {shownPage < lastPage && (
            <Link
              href={{ pathname: "/annonces", query: { ...pageQuery, page: String(shownPage + 1) } }}
              className="rounded-full bg-surface px-4 py-2 text-[12.5px] font-bold text-foreground ring-1 ring-border hover:text-gold"
            >
              Suivant
            </Link>
          )}
        </nav>
          )}
        </div>
      </div>
    </main>
  );
}
