/* eslint-disable react-hooks/purity -- Server Component.
 * The react-hooks v7 purity rule governs the CLIENT render path: it forbids
 * impure reads (Date.now(), Math.random()) during a render React may replay.
 * This module is an async Server Component — it runs once, per request, on the
 * server, and reading the clock is the correct way to answer "what is overdue"
 * or "which badge has lapsed". There is no render to replay. */
import { unstable_cache } from "next/cache";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import { listingIdsMatching } from "@/lib/fitment";
import { CatalogSidebar, CatalogToolbar } from "./CatalogFilters";
import { ReelsFeed } from "@/components/annonces/ReelsFeed";
import {
  applyCatalogFilters,
  FILTER_KEYS,
  LISTING_SELECT,
  normalizeKind,
  one,
  sortFor,
  toReelItem,
  FEED_PAGE_SIZE,
  type CatalogSearchParams,
  type ListingRow,
} from "@/lib/catalog/query";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { getServerSupabase } from "@/lib/supabase/server";
import { BadgeCheck, ImageOff, Images, MapPin, SearchX, Wrench, Car } from "lucide-react";
import { CONDITIONS, FUELS, TRANSMISSIONS } from "@/lib/vehicles";
import { LinkBusy } from "@/components/ui/LinkBusy";

type Cat = { id: string; parent_id: string | null; label_fr: string; kind: string };

/**
 * The category tree is reference data — it is seeded by migration and changes
 * about never — but it was re-read from a remote Postgres on every render,
 * including every filter change. Cached under a tag so it can still be busted
 * the day categories become editable.
 */
const fetchCategories = unstable_cache(
  async (): Promise<Cat[]> => {
    const admin = getServiceSupabase();
    if (!admin) return [];
    const { data } = await admin
      .from("categories")
      .select("id, parent_id, label_fr, kind, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    return (data ?? []) as Cat[];
  },
  ["catalog-categories"],
  { revalidate: 3600, tags: ["categories"] },
);

/**
 * One definition, used by the results AND by the loading skeleton, so the
 * placeholder can never drift out of step with the thing it stands in for.
 *
 * Four across at 1280 put 250px cards on a 15" laptop — a thumbnail, not a
 * listing. The rail already takes 272px, so the count now steps 2 → 3 → 4 with
 * the space actually available, and the cards grow instead of multiplying.
 */
const GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3 2xl:grid-cols-4";

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

// SearchParams, the row shape, the SELECT list and the filter chain all live
// in @/lib/catalog/query now — the reels feed pages from an API route and has
// to run the identical query, and a second copy of that chain is how a feed
// ends up showing rows the filters excluded.
type SearchParams = CatalogSearchParams;

/**
 * The catalog pages rather than truncating. It used to `.limit(60)` and print
 * `rows.length` as the total — which was invisible while the catalog held a
 * handful of cars, and became two bugs the moment it filled up: the count
 * under-reported the real number, and everything past the 60th listing was
 * unreachable because nothing linked to it.
 */
const PAGE_SIZE = 24;

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

  // Kicked off before anything is awaited so the listings query and the
  // viewer's session travel to the database together instead of one after the
  // other. Filtering was five SEQUENTIAL round trips to a remote Postgres —
  // the query itself is single-digit milliseconds, the waiting was the cost.
  const catsPromise = fetchCategories();
  const userPromise = getServerSupabase().then(async (c) => ({
    client: c,
    user: (await c.auth.getUser()).data.user,
  }));

  const catRows = await catsPromise;

  const cats = catRows;
  const leaves = cats.filter((c) => c.parent_id != null);

  const kind = normalizeKind(sp.kind);
  const visibleCats = kind ? leaves.filter((c) => c.kind === kind) : leaves;

  // ── Fitment first: it narrows the set before anything else does ──────────
  // The DB query is a coarse filter (make, roughly the model); the exact rule —
  // accent folding, model matching in either direction, open-ended year ranges
  // — lives in src/lib/fitment.ts, where it is unit-tested. Two places deciding
  // what "compatible" means is how a buyer ends up with parts for another car.
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

  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  // The feed takes smaller bites than the grid: 24 cards is a screenful of
  // thumbnails and two dozen full-bleed photos. One query either way — the
  // size just changes.
  const isReels = sp.view === "reels";
  const pageSize = isReels ? FEED_PAGE_SIZE : PAGE_SIZE;

  // The filter chain is shared with /api/annonces/feed — see the note on the
  // import. `visibleCatIds` and `fitmentIds` are the two inputs it cannot work
  // out for itself, because each needs its own database read.
  const filterOpts = { visibleCatIds: visibleCats.map((c) => c.id), fitmentIds };
  const applyFilters = <T,>(builder: T): T => applyCatalogFilters(builder, sp, filterOpts);

  const { column: sortColumn, ascending: sortAsc } = sortFor(sp);

  const pagedQuery = (offset: number) =>
    applyFilters(
      admin
        .from("listings")
        .select(LISTING_SELECT, { count: "exact" })
        .eq("status", "published")
        .order(sortColumn, { ascending: sortAsc, nullsFirst: false })
        .range(offset, offset + pageSize - 1),
    );

  const countQuery = () =>
    applyFilters(
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    );

  const { data, count } = await pagedQuery((page - 1) * pageSize);
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
      const last = Math.max(1, Math.ceil(total / pageSize));
      const { data: clamped } = await pagedQuery((last - 1) * pageSize);
      rows = (clamped ?? []) as ListingRow[];
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const shownPage = Math.min(page, lastPage);

  // Paging must carry the active filters, or "Suivant" quietly drops the
  // buyer back into the unfiltered catalog. Empty values are left out so the
  // URL stays readable.
  const pageQuery: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    if (v) pageQuery[k] = v;
  }
  if (sp.view) pageQuery.view = sp.view;

  // Which of these the viewer already saved — one read, through their own
  // session so RLS decides what they can see.
  // Both of these depend on `rows`, and on nothing else — so they go together.
  const { client: userClient, user } = await userPromise;
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];

  const [savedRes, badgeRes] = await Promise.all([
    user && rows.length > 0
      ? userClient
          .from("watchlist")
          .select("listing_id")
          .eq("user_id", user.id)
          .in("listing_id", rows.map((r) => r.id))
      : Promise.resolve({ data: null }),
    sellerIds.length > 0
      ? admin
          .from("seller_badges")
          .select("seller_id, expires_at, revoked_at")
          .in("seller_id", sellerIds)
          .is("revoked_at", null)
      : Promise.resolve({ data: null }),
  ]);

  const savedIds = new Set<string>();
  for (const w of (savedRes.data ?? []) as { listing_id: string | null }[]) {
    if (w.listing_id) savedIds.add(w.listing_id);
  }

  const badged = new Set<string>();
  const now = Date.now();
  for (const b of (badgeRes.data ?? []) as { seller_id: string; expires_at: string }[]) {
    if (new Date(b.expires_at).getTime() > now) badged.add(b.seller_id);
  }

  const filterState = {
    kind: kind ?? "", cat: sp.cat ?? "", gov: sp.gov ?? "", q: sp.q ?? "",
    make: sp.make ?? "", model: sp.model ?? "", year: sp.year ?? "",
    min: sp.min ?? "", max: sp.max ?? "", fuel: sp.fuel ?? "", etat: sp.etat ?? "",
    boite: sp.boite ?? "", sort: sp.sort ?? "",
    year_min: sp.year_min ?? "", year_max: sp.year_max ?? "", km_max: sp.km_max ?? "",
    view: sp.view === "reels" ? "reels" : "",
  };
  const filterProps = {
    categories: visibleCats.map((c) => ({ id: c.id, label: c.label_fr, kind: c.kind })),
    governorates: [...GOVERNORATES],
    current: filterState,
  };

  // ── The vertical feed ───────────────────────────────────────────────────
  // A different page, not a different grid: it fills the shell exactly, and
  // the browser — not the document — does the scrolling inside it, so a flick
  // snaps to the next annonce instead of scrolling the site.
  if (isReels) {
    const feedQuery = new URLSearchParams(pageQuery);
    feedQuery.delete("page");
    feedQuery.delete("view");

    return (
      <div
        // The exact height the shell leaves: below the top bar and above the
        // tab bar on a phone, below the desktop nav above lg. `.batta-shell-main`
        // pads for both, and these subtract the same values back off.
        className="flex flex-col
          h-[calc(100dvh-var(--batta-topbar-h)-var(--batta-safe-top)-var(--batta-bottombar-total)-var(--batta-safe-bottom))]
          lg:h-[calc(100dvh-var(--desktop-nav-h))]"
      >
        <h1 className="sr-only">Annonces — vue reels</h1>

        <div className="shrink-0 border-b border-border lg:mx-auto lg:w-full lg:max-w-[440px] lg:px-4">
          <CatalogToolbar {...filterProps} total={total} compact />
        </div>

        <div className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
                <SearchX className="size-6" />
              </span>
              <p className="text-[15px] font-bold text-foreground">Aucune annonce ne correspond</p>
              <Link href={"/annonces?view=reels" as never} className="batta-btn-luxe mt-2 inline-flex px-5 py-2.5 text-[13px]">
                Voir toutes les annonces
              </Link>
            </div>
          ) : (
            // On a phone the feed is the screen. On a desktop it is a column
            // the shape of a phone, centred — the same answer Instagram
            // reached, because a full-bleed portrait photo on a 27" monitor is
            // mostly letterbox.
            <div className="mx-auto h-full w-full overflow-hidden lg:max-w-[440px] lg:rounded-2xl lg:border lg:border-border lg:my-3 lg:h-[calc(100%-1.5rem)]">
              <ReelsFeed
                initialItems={rows.map((r) => toReelItem(r, badged))}
                initialSaved={[...savedIds]}
                loggedIn={user !== null}
                locale={locale}
                filterQuery={feedQuery.toString()}
                nextPage={shownPage < lastPage ? shownPage + 1 : null}
                total={total}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 py-5 lg:px-6 lg:py-8">
      {/* No page title, no strapline.
          A visitor reaches this screen by tapping « Annonces », from a bar
          that already says Mazed Auto — being told a third time what they are
          looking at costs a third of the first screen on a phone and tells
          nobody anything. The results are the heading. The h1 stays for
          assistive tech and for search engines, which do still need it. */}
      <h1 className="sr-only">Annonces — voitures et pi&egrave;ces de rechange</h1>

      {/* Rail beside the results on desktop. On a phone the rail becomes a
          sheet and this collapses to one column. */}
      <div className="mt-5 lg:mt-0 lg:grid lg:grid-cols-[272px_1fr] lg:gap-7">
        <CatalogSidebar {...filterProps} />

        <div className="min-w-0">
          <CatalogToolbar {...filterProps} total={total} />

          {/* `data-catalog-results` is what globals.css dims while a filter
              transition is in flight — see the RouteProgress bar. */}
          <div data-catalog-results>
          {/* Shown by CSS while `data-filtering` is on the document — see
              globals.css. Eight cards is enough to fill the fold at any width;
              the container clips the rest. */}
          <div data-catalog-skeleton aria-hidden>
            <div className={`mt-4 lg:mt-5 ${GRID}`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="catalog-skel aspect-[4/3]" />
                  <div className="space-y-2 p-3 lg:p-4">
                    <div className="catalog-skel h-2 w-1/3 rounded-full" />
                    <div className="catalog-skel h-3 w-11/12 rounded-full" />
                    <div className="catalog-skel h-2.5 w-2/3 rounded-full" />
                    <div className="catalog-skel h-4 w-1/2 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

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
            <div className={`mt-4 lg:mt-5 ${GRID}`}>
              {rows.map((l) => {
                const cat = one(l.category);
                const photos = (l.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
                // Honour the cover an admin picked in /admin/home; falls back
                // to the seller's first photo when nobody has chosen one.
                const cover = photos.find((p) => p.is_cover) ?? photos[0];
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
                    className="press group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition duration-300 hover:border-gold-soft hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.6)] lg:rounded-[20px] lg:hover:-translate-y-1 lg:hover:shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)]"
                  >
                    <LinkBusy />
                    <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
                      {cover ? (
                        <ListingImage
                          path={cover.storage_path}
                          alt={l.title}
                          sizes="(min-width:1536px) 20vw, (min-width:1280px) 26vw, (min-width:1024px) 34vw, (min-width:640px) 33vw, 50vw"
                          className="transition duration-500 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-muted">
                          <ImageOff className="size-6" />
                        </span>
                      )}

                      {/* Badges sit on whatever the seller photographed. A
                          bottom-up scrim keeps them legible on a white car in
                          full sun without dimming the picture itself. */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent"
                      />

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

                    <div className="flex flex-1 flex-col p-3 lg:p-4">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                        {isPart ? <Wrench className="size-3" /> : <Car className="size-3" />}
                        {cat?.label_fr ?? ""}
                      </span>

                      <h2 className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground lg:mt-1.5 lg:text-[15.5px]">
                        {l.title}
                      </h2>

                      {specs.length > 0 && (
                        // Two facts on a phone, three from sm up. A card this
                        // narrow truncates the third mid-word ("Dies\u2026"), which
                        // reads as broken rather than as "there is more".
                        <p className="mt-1 line-clamp-1 text-[11.5px] text-muted lg:text-[12.5px]">
                          {specs.slice(0, 3).map((sp, i) => (
                            <span key={sp} className={i > 1 ? "hidden sm:inline" : undefined}>
                              {i > 0 ? " \u00b7 " : ""}
                              {sp}
                            </span>
                          ))}
                        </p>
                      )}

                      <p className="batta-tabular mt-auto pt-2 text-[15px] font-extrabold text-gold lg:pt-3 lg:text-[18px]">
                        {l.price_on_request || l.price == null
                          ? "Sur demande"
                          : `${formatTND(Number(l.price), locale)} TND`}
                      </p>

                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted lg:text-[12px]">
                        <MapPin className="size-3" /> {l.governorate}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          </div>

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
