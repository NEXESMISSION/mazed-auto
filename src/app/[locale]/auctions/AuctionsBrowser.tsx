"use client";

import { useState, useMemo, useDeferredValue, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  Search,
  X,
  SearchX,
  Car,
  Truck,
  Caravan,
  LayoutGrid,
  List as ListIcon,
  Rows3,
  ArrowUpDown,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { AuctionRow } from "@/components/auction/AuctionRow";
import { LargeAuctionCard } from "@/components/auction/LargeAuctionCard";
import { useRealtimeAuctionList } from "@/lib/realtime";
import { thumb } from "@/lib/imageUrl";
import type { Auction, VehicleCategory } from "@/lib/types";
import type { CmsBrand } from "@/lib/cms";
import { BrowseViewToggle } from "./BrowseViewToggle";
import {
  BrowseFilters,
  EMPTY_FILTERS,
  type BrowseFilterState,
} from "./BrowseFilters";

const FINAL_STATUSES = new Set([
  "ended",
  "reserve_not_met",
  "cancelled",
  "pending_seller_decision",
]);

type ViewMode = "grid" | "list" | "large";

type SortKey =
  | "newest"
  | "ending_soon"
  | "price_asc"
  | "price_desc"
  | "most_bids";

// Value list is stable; label is resolved per-render via
// useTranslations("auctions.sort") so AR/FR both render in-language.
const SORT_VALUES: SortKey[] = [
  "newest",
  "ending_soon",
  "price_asc",
  "price_desc",
  "most_bids",
];

// Map from SortKey to the matching key in `messages.json`. Kept in one
// place so the translation lookup at the call site stays one-liner.
const SORT_I18N_KEY: Record<SortKey, string> = {
  newest: "newest",
  ending_soon: "endingSoon",
  price_asc: "priceAsc",
  price_desc: "priceDesc",
  most_bids: "mostBids",
};

interface Props {
  initial: Auction[];
  /** When true, render the classic Marques + Catégories grid landing
   *  page instead of the modern filter-bar list. Tapping a tile pushes
   *  ?brand= / ?body= and drops back to modern so the user sees results. */
  classicMode?: boolean;
  /** Seller IDs whose plan grants `has_trusted_seller_badge`. Resolved
   *  once on the server and passed as a plain string[] (Set isn't
   *  JSON-serializable across the server→client boundary). */
  trustedSellerIds?: string[];
  /** Admin-curated brand list from cms_brands. When provided, the
   *  classic view's Marques grid uses these (with their uploaded logos)
   *  as the source of truth instead of deriving tiles from auction
   *  photos. Falls back to pool-derived tiles when empty. */
  brands?: CmsBrand[];
}

// Body type values are stable enum keys; labels resolve via
// useTranslations("auctions.category") so /fr and /ar both render
// in-language. Icons stay co-located here since they're presentational.
const BODY_TYPES: Array<{
  value: VehicleCategory;
  icon: LucideIcon;
}> = [
  { value: "sedan",       icon: Car },
  { value: "suv",         icon: Truck },
  { value: "hatchback",   icon: Car },
  { value: "pickup",      icon: Truck },
  { value: "coupe",       icon: Car },
  { value: "convertible", icon: Car },
  { value: "wagon",       icon: Car },
  { value: "van",         icon: Caravan },
];

/**
 * Single-page browse:
 * sticky filter bar (search + sort + advanced filters + layout toggle),
 * active-filter chip strip with one-tap remove, quick brand+category
 * chips when no scope is set, then the result list in one of three view
 * modes: list (compact rows), grid (2-col cards), large (single-column
 * 16:9 hero cards). Brand and category still drive `?brand=…` / `?body=…`
 * URL params so links stay shareable.
 */
/**
 * Top-level dispatcher — holds NO hooks. Routes to either the modern
 * filter-bar browse or the classic Marques+Catégories hub based on the
 * `classicMode` flag. Each branch is its own component so the React
 * hook-call count stays stable when the flag flips. Mixing both flows
 * inside a single component caused "Rendered fewer hooks than expected"
 * the moment the user toggled views.
 */
export function AuctionsBrowser({
  initial,
  classicMode = false,
  trustedSellerIds = [],
  brands = [],
}: Props) {
  // Rebuild the Set once per render — passing it down keeps each card's
  // `.has()` lookup O(1) without rebuilding for every card.
  const trustedSet = new Set(trustedSellerIds);
  return classicMode ? (
    <ClassicHub initial={initial} brands={brands} />
  ) : (
    <ModernBrowser initial={initial} trustedSellers={trustedSet} />
  );
}

function ModernBrowser({
  initial,
  trustedSellers,
}: {
  initial: Auction[];
  trustedSellers: Set<string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const tSort = useTranslations("auctions.sort");
  const tCat = useTranslations("auctions.category");
  const brand = params.get("brand");
  const body = params.get("body") as VehicleCategory | null;

  const list = useRealtimeAuctionList(initial);
  // Seed the search box from `?q=` so deep-linked / Google-indexed
  // /auctions?q=clio URLs land on the matching results immediately
  // (and so the user can copy-paste their current search to share).
  const initialQ = params.get("q") ?? "";
  const [search, setSearch] = useState(initialQ);
  // Defer the heavy filter+sort recompute one frame behind keystrokes
  // so typing stays smooth. The input still uses `search`; the
  // memoised result reads `deferredSearch`. React picks up the latest
  // value when the user pauses typing.
  const deferredSearch = useDeferredValue(search);

  // Mirror `search` back into the URL after a short debounce, so:
  //   1. The current filtered view is shareable (copy the URL → other
  //      user lands on the same results).
  //   2. Google's bot, when crawling the sitemap and following the
  //      ?brand= variants, can also see ?q=… variants if we ever link
  //      to them — and the canonical (set in page metadata) still
  //      points at the bare /auctions, so PageRank isn't fragmented.
  //
  // Debounced 350ms — fast enough to feel responsive on share, slow
  // enough not to push 60 URL updates per second of typing into the
  // history stack. Read window.location fresh inside the timer so a
  // mid-debounce `router.push` from a filter-chip click (which updates
  // ?brand= or ?body=) isn't clobbered by a stale `params` snapshot.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const fresh = new URLSearchParams(window.location.search);
      if (search.trim()) fresh.set("q", search.trim());
      else fresh.delete("q");
      const qs = fresh.toString();
      // router.replace not push so we don't pollute the back-stack with
      // every keystroke — back-arrow should land on the page the user
      // came from, not on each typed letter.
      router.replace(qs ? `/auctions?${qs}` : "/auctions");
    }, 350);
    return () => window.clearTimeout(t);
    // We deliberately omit `router` and `params` — router is stable,
    // and we read params fresh from window.location above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [filters, setFilters] = useState<BrowseFilterState>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("newest");
  const [sortOpen, setSortOpen] = useState(false);

  // Brand index — count + first auction's image. Used for the quick-chip
  // strip and the "no scope" suggestion grid.
  const brandIndex = useMemo(() => {
    const data = new Map<string, { count: number; image?: string }>();
    for (const a of list) {
      const m = a.vehicle.make.trim();
      if (!m) continue;
      const existing = data.get(m);
      data.set(m, {
        count: (existing?.count ?? 0) + 1,
        image: existing?.image ?? a.vehicle.imageUrls[0],
      });
    }
    return Array.from(data.entries())
      .map(([name, d]) => ({ name, count: d.count, image: d.image }))
      .sort((a, b) => b.count - a.count);
  }, [list]);

  const filteredAuctions = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const minPrice = Number(filters.minPrice) || 0;
    const maxPrice = Number(filters.maxPrice) || Infinity;
    const minYear = Number(filters.minYear) || 0;
    const maxYear = Number(filters.maxYear) || Infinity;
    const maxKm = Number(filters.maxKm) || Infinity;
    // Read-only timestamp inside useMemo — the rule misfires here.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    const filtered = list.filter((a) => {
      if (brand && a.vehicle.make !== brand) return false;
      if (body && a.vehicle.category !== body) return false;

      const isFinished =
        FINAL_STATUSES.has(a.status) || a.endTime.getTime() <= now;
      if (filters.status === "live" && isFinished) return false;
      if (filters.status === "finished" && !isFinished) return false;

      if (filters.fuel !== "any" && a.vehicle.fuelType !== filters.fuel)
        return false;
      if (
        filters.condition !== "any" &&
        a.vehicle.condition !== filters.condition
      )
        return false;
      if (a.currentPrice < minPrice || a.currentPrice > maxPrice) return false;
      if (a.vehicle.year < minYear || a.vehicle.year > maxYear) return false;
      if (a.vehicle.mileage > maxKm) return false;

      if (!q) return true;
      return (
        a.vehicle.make.toLowerCase().includes(q) ||
        a.vehicle.model.toLowerCase().includes(q) ||
        a.vehicle.city.toLowerCase().includes(q) ||
        a.vehicle.color.toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];
    switch (sort) {
      case "ending_soon":
        sorted.sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
        break;
      case "price_asc":
        sorted.sort((a, b) => a.currentPrice - b.currentPrice);
        break;
      case "price_desc":
        sorted.sort((a, b) => b.currentPrice - a.currentPrice);
        break;
      case "most_bids":
        sorted.sort((a, b) => b.totalBids - a.totalBids);
        break;
      case "newest":
      default:
        sorted.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }
    return sorted;
  }, [list, deferredSearch, brand, body, filters, sort]);

  // Build the active-filter chip list. Each chip carries an action that
  // clears that one dimension only, so the user can drill in and out
  // without ever resetting the whole state by mistake.
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (brand)
      chips.push({
        key: "brand",
        label: brand,
        clear: () => updateScope({ brand: null }),
      });
    if (body)
      chips.push({
        key: "body",
        label: tCat(body),
        clear: () => updateScope({ body: null }),
      });
    if (filters.status !== "live")
      chips.push({
        key: "status",
        label: filters.status === "finished" ? "Terminées" : "Toutes",
        clear: () => setFilters((f) => ({ ...f, status: "live" })),
      });
    if (filters.fuel !== "any")
      chips.push({
        key: "fuel",
        label: FUEL_LABEL[filters.fuel] ?? filters.fuel,
        clear: () => setFilters((f) => ({ ...f, fuel: "any" })),
      });
    if (filters.condition !== "any")
      chips.push({
        key: "condition",
        label: CONDITION_LABEL[filters.condition] ?? filters.condition,
        clear: () => setFilters((f) => ({ ...f, condition: "any" })),
      });
    if (filters.minPrice || filters.maxPrice)
      chips.push({
        key: "price",
        label: `Prix : ${formatRange(filters.minPrice, filters.maxPrice)} TND`,
        clear: () =>
          setFilters((f) => ({ ...f, minPrice: "", maxPrice: "" })),
      });
    if (filters.minYear || filters.maxYear)
      chips.push({
        key: "year",
        label: `Année : ${formatRange(filters.minYear, filters.maxYear)}`,
        clear: () => setFilters((f) => ({ ...f, minYear: "", maxYear: "" })),
      });
    if (filters.maxKm)
      chips.push({
        key: "km",
        label: `≤ ${filters.maxKm} km`,
        clear: () => setFilters((f) => ({ ...f, maxKm: "" })),
      });
    return chips;
    // updateScope is defined below; it captures `params` and `router`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, body, filters]);

  const hasAnyFilter = activeChips.length > 0 || search.length > 0;

  function updateScope({
    brand: nextBrand,
    body: nextBody,
  }: {
    brand?: string | null;
    body?: VehicleCategory | null;
  }) {
    const next = new URLSearchParams(params.toString());
    if (nextBrand === null) next.delete("brand");
    else if (nextBrand !== undefined) next.set("brand", nextBrand);
    if (nextBody === null) next.delete("body");
    else if (nextBody !== undefined) next.set("body", nextBody);
    const qs = next.toString();
    router.push(qs ? `/auctions?${qs}` : "/auctions");
  }

  function clearAll() {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    router.push("/auctions");
  }

  return (
    <div className="pb-8">
      {/* DESKTOP toolbar — title + view toggle. Mobile gets the toggle
          via BrowseHeader; on desktop neither chrome layer renders it
          so we surface it here, above the sticky filter bar, for both
          view modes parity (the Classique branch has the same widget). */}
      <div className="hidden lg:flex items-end justify-between gap-6 px-8 pt-10 pb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
            Mazed Auto · Catalogue
          </div>
          <h1 className="mt-1.5 text-4xl xl:text-5xl font-black tracking-tight leading-none">
            Toutes les <span className="gradient-gold-text">enchères</span>
          </h1>
        </div>
        <BrowseViewToggle />
      </div>

      {/* ─── Sticky control bar ───────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[var(--background)]/85 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="px-4 pt-3 pb-2 space-y-2">
          {/* Search */}
          <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors ps-4 pe-1.5 h-11">
            <Search className="h-4 w-4 text-[var(--foreground-muted)] shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Marque, modèle, ville..."
              className="flex-1 bg-transparent text-[15px] placeholder:text-[var(--foreground-subtle)] focus:outline-none min-w-0"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Effacer"
                className="h-7 w-7 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Toolbar row */}
          <div className="flex items-center gap-1.5">
            {/* Sort */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[12px] font-bold hover:border-[var(--gold-soft)] transition-colors"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {tSort(SORT_I18N_KEY[sort])}
              </button>
              {sortOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Fermer"
                    onClick={() => setSortOpen(false)}
                    className="fixed inset-0 z-10"
                  />
                  <div
                    role="listbox"
                    className="absolute z-20 top-full mt-1.5 start-0 min-w-[12rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] overflow-hidden"
                  >
                    {SORT_VALUES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={value === sort}
                        onClick={() => {
                          setSort(value);
                          setSortOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3.5 h-10 text-[13px] font-semibold text-start ${
                          value === sort
                            ? "bg-[var(--gold-faint)] text-[var(--gold)]"
                            : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        {value === sort ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-3.5 w-3.5" />
                        )}
                        {tSort(SORT_I18N_KEY[value])}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Advanced filters modal — uses BrowseFilters' own trigger button */}
            <BrowseFilters value={filters} onChange={setFilters} />

            {/* Layout toggle */}
            <div className="ms-auto inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5">
              <ViewToggle
                active={viewMode === "list"}
                onClick={() => setViewMode("list")}
                label="Vue compacte"
                icon={Rows3}
              />
              <ViewToggle
                active={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                label="Vue grille"
                icon={LayoutGrid}
              />
              <ViewToggle
                active={viewMode === "large"}
                onClick={() => setViewMode("large")}
                label="Vue détaillée"
                icon={ListIcon}
              />
            </div>
          </div>

          {/* Active filter chips */}
          {(activeChips.length > 0 || search.length > 0) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {search.length > 0 && (
                <ActiveChip
                  label={`«${search}»`}
                  onClear={() => setSearch("")}
                />
              )}
              {activeChips.map((c) => (
                <ActiveChip key={c.key} label={c.label} onClear={c.clear} />
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="ms-1 shrink-0 inline-flex items-center h-7 px-3 rounded-full text-[11px] font-bold text-[var(--foreground-muted)] hover:text-foreground hover:bg-[var(--surface-2)] transition-colors"
              >
                Tout effacer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Quick brand chips (only when no scope yet) ─── */}
      {!hasAnyFilter && brandIndex.length > 0 && (
        <div className="px-4 mt-4">
          <ChipStrip
            eyebrow="Marques populaires"
            items={brandIndex.slice(0, 12).map((b) => ({
              key: b.name,
              label: b.name,
              count: b.count,
              onClick: () => updateScope({ brand: b.name }),
            }))}
          />
        </div>
      )}

      {/* ─── Result count ─── */}
      <div className="px-4 mt-4 flex items-baseline justify-between gap-3">
        <h2 className="font-extrabold text-[15px] tracking-tight">
          {hasAnyFilter ? "Résultats" : "Toutes les enchères"}
        </h2>
        <span className="text-[12px] text-[var(--foreground-muted)] tabular-nums">
          {filteredAuctions.length}{" "}
          {filteredAuctions.length === 1 ? "annonce" : "annonces"}
        </span>
      </div>

      {/* ─── Results ─── */}
      {filteredAuctions.length === 0 ? (
        <div className="text-center py-16 space-y-3 px-4 mt-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
            <SearchX className="h-7 w-7" />
          </div>
          <div className="font-bold text-base">
            {buildEmptyTitle({ search, brand, body })}
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            {hasAnyFilter
              ? "Essayez d'élargir vos critères ou de revenir plus tard."
              : "Aucune annonce n'est en ligne pour le moment."}
          </p>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center h-9 px-4 rounded-full bg-[var(--gold)] text-black text-[12px] font-bold shadow-[var(--shadow-gold)]"
            >
              Effacer les filtres
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 px-4">
          {filteredAuctions.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              isTrustedSeller={trustedSellers.has(auction.seller.id)}
            />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="mt-3 px-4 space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {filteredAuctions.map((auction) => (
            <AuctionRow
              key={auction.id}
              auction={auction}
              isTrustedSeller={trustedSellers.has(auction.seller.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 px-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {filteredAuctions.map((auction) => (
            <LargeAuctionCard
              key={auction.id}
              auction={auction}
              isTrustedSeller={trustedSellers.has(auction.seller.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const FUEL_LABEL: Record<string, string> = {
  gasoline: "Essence",
  diesel: "Diesel",
  hybrid: "Hybride",
  electric: "Électrique",
};

const CONDITION_LABEL: Record<string, string> = {
  new: "Neuf",
  excellent: "Excellent",
  good: "Bon",
  fair: "Correct",
  damaged: "Endommagé",
};

function formatRange(min: string | number, max: string | number): string {
  const m = String(min || "");
  const M = String(max || "");
  if (m && M) return `${m} – ${M}`;
  if (m) return `≥ ${m}`;
  if (M) return `≤ ${M}`;
  return "";
}

function ActiveChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 h-7 ps-3 pe-1 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/40 text-[var(--gold)] text-[11px] font-bold">
      <span className="truncate max-w-[10rem]">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Retirer ${label}`}
        className="h-5 w-5 rounded-full bg-[var(--gold)] text-black flex items-center justify-center hover:scale-105 transition-transform"
      >
        <X className="h-3 w-3" strokeWidth={3} />
      </button>
    </span>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`h-8 w-8 rounded-full inline-flex items-center justify-center transition-colors ${
        active
          ? "bg-[var(--gold)] text-black"
          : "text-[var(--foreground-muted)] hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Classic discovery hub — the original "browse" UX with Marques and
 * Catégories rendered as image-anchored boxes. Kept around so the user
 * can A/B compare it against the modern filter-bar list. Tile taps push
 * `?brand=…` / `?body=…` and drop the `view=classic` flag, so the user
 * lands directly on filtered modern results.
 */
function ClassicHub({
  initial,
  brands,
}: {
  initial: Auction[];
  brands: CmsBrand[];
}) {
  const router = useRouter();
  const tCat = useTranslations("auctions.category");
  const list = useRealtimeAuctionList(initial);
  const [search, setSearch] = useState("");
  // Same trick as ModernBrowser — keep typing snappy on the brand
  // filter, defer the actual filter recompute by one frame.
  const deferredSearch = useDeferredValue(search);

  // Build the brand grid in two stages so admin-curated logos win over
  // any auction fallback:
  //   1. Count auctions per make + remember the first photo as fallback
  //   2. If cms_brands is non-empty, render every active brand in its
  //      admin-defined order with its uploaded logo, falling back to
  //      the first auction photo only when no logo is uploaded.
  //      If cms_brands is empty, derive tiles from the pool (legacy
  //      behaviour — keeps a fresh install useful).
  const brandIndex = useMemo(() => {
    const countByMake = new Map<string, number>();
    const firstPhotoByMake = new Map<string, string>();
    for (const a of list) {
      const m = a.vehicle.make.trim();
      if (!m) continue;
      countByMake.set(m, (countByMake.get(m) ?? 0) + 1);
      if (!firstPhotoByMake.has(m) && a.vehicle.imageUrls[0]) {
        firstPhotoByMake.set(m, a.vehicle.imageUrls[0]);
      }
    }
    if (brands.length > 0) {
      // Skip brands without a logo so the user never sees a broken-image
      // placeholder. Upload a logo via /admin/cms/brands to surface them.
      return brands
        .filter((b) => Boolean(b.logoUrl))
        .map((b) => ({
          name: b.displayName,
          count: countByMake.get(b.displayName) ?? 0,
          image: b.logoUrl as string,
        }));
    }
    return Array.from(countByMake.entries())
      .map(([name, count]) => ({
        name,
        count,
        image: firstPhotoByMake.get(name),
      }))
      .sort((a, b) => b.count - a.count);
  }, [list, brands]);

  const bodyIndex = useMemo(() => {
    const firstByCategory = new Map<VehicleCategory, string>();
    const counts = new Map<VehicleCategory, number>();
    for (const a of list) {
      const c = a.vehicle.category;
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (!firstByCategory.has(c) && a.vehicle.imageUrls[0]) {
        firstByCategory.set(c, a.vehicle.imageUrls[0]);
      }
    }
    return BODY_TYPES.map((b) => ({
      ...b,
      label: tCat(b.value),
      count: counts.get(b.value) ?? 0,
      image: firstByCategory.get(b.value),
    }));
  }, [list, tCat]);

  const filteredBrands = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return brandIndex;
    return brandIndex.filter((b) => b.name.toLowerCase().includes(q));
  }, [brandIndex, deferredSearch]);

  return (
    <div className="pt-5 pb-8 lg:pt-10 lg:pb-16">
      {/* ────────────────────────────────────────────────────────────
          DESKTOP toolbar — gives the page its own title + a visible
          view toggle so the user can flip back to Moderne. Mobile
          uses BrowseHeader (which renders the toggle for that
          viewport), so this block is lg-only.
          ──────────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex items-end justify-between gap-6 px-8 mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
            Mazed Auto · Catalogue
          </div>
          <h1 className="mt-1.5 text-4xl xl:text-5xl font-black tracking-tight leading-none">
            Parcourir par{" "}
            <span className="gradient-gold-text">marque</span>
          </h1>
          <p className="mt-2.5 text-sm text-[var(--foreground-muted)] max-w-xl leading-relaxed">
            Toutes les marques disponibles aux enchères en Tunisie.
            Choisissez une marque ou une carrosserie pour filtrer les
            voitures.
          </p>
        </div>
        <BrowseViewToggle />
      </div>

      {/* Search bar — narrows the brand grid. Wider + centered on
          desktop so it feels like a directory search, not a chip. */}
      <div className="px-4 lg:px-8">
        <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors ps-4 pe-1.5 h-12 lg:h-14 lg:max-w-xl">
          <Search className="h-4 w-4 lg:h-5 lg:w-5 text-[var(--foreground-muted)] shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les marques..."
            className="flex-1 bg-transparent text-base lg:text-[15px] placeholder:text-[var(--foreground-subtle)] focus:outline-none min-w-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer"
              className="h-8 w-8 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {filteredBrands.length > 0 && (
        <section className="mt-6 lg:mt-10">
          <ClassicSectionHeader label="Marques" count={filteredBrands.length} />
          {/* Mobile: 3 cols, tight. Desktop: 6 cols, generous gap. */}
          <div className="px-4 lg:px-8 mt-2.5 lg:mt-5 grid grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 lg:gap-4">
            {filteredBrands.map((b) => (
              <ClassicImageBox
                key={b.name}
                label={b.name}
                count={b.count}
                image={b.image}
                fit="contain"
                fallbackInitials={b.name.slice(0, 2).toUpperCase()}
                onClick={() =>
                  router.push(
                    `/auctions?brand=${encodeURIComponent(b.name)}`,
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 lg:mt-12">
        <ClassicSectionHeader label="Catégories" count={BODY_TYPES.length} />
        {/* Categories are full car photos — let them breathe on
            desktop. 3 cols on mobile, 4 on lg, 5 on xl. */}
        <div className="px-4 lg:px-8 mt-2.5 lg:mt-5 grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 lg:gap-4">
          {bodyIndex.map((bt) => (
            <ClassicImageBox
              key={bt.value}
              label={bt.label}
              count={bt.count}
              image={bt.image}
              fit="cover"
              fallbackIcon={bt.icon}
              disabled={bt.count === 0}
              onClick={() =>
                router.push(`/auctions?body=${encodeURIComponent(bt.value)}`)
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}


function ClassicImageBox({
  label,
  count,
  image,
  fit = "cover",
  fallbackInitials,
  fallbackIcon: FallbackIcon,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  image?: string;
  /** "contain" for brand logos (sit whole inside the tile),
   *  "cover" for category photos (fill the tile, may crop edges). */
  fit?: "cover" | "contain";
  fallbackInitials?: string;
  fallbackIcon?: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isContain = fit === "contain";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /* Brand tiles get a pure-black bg so logos (most have a black
         canvas already) blend seamlessly with no visible seam.
         Category tiles keep the standard surface bg + cover crop. */
      className={`relative aspect-square rounded-2xl overflow-hidden flex items-end transition-all disabled:opacity-40 disabled:cursor-not-allowed ring-1 ring-[var(--border)] hover:ring-2 hover:ring-[var(--gold-soft)] active:scale-[0.98] ${
        isContain ? "bg-black" : "bg-[var(--surface-2)]"
      }`}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb(image, { width: 480, quality: 70 })}
            alt=""
            className={`absolute inset-0 h-full w-full ${
              isContain ? "object-contain" : "object-cover"
            }`}
            loading="lazy"
            decoding="async"
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black via-black/70 to-transparent" />
        </>
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] flex items-center justify-center">
          {fallbackInitials ? (
            <span className="text-2xl font-extrabold text-[var(--gold)] tracking-tight">
              {fallbackInitials}
            </span>
          ) : FallbackIcon ? (
            <FallbackIcon className="h-7 w-7 text-[var(--gold)]" />
          ) : null}
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        </span>
      )}
      <div className="relative w-full p-2.5 text-start">
        <div className="text-[12px] font-extrabold text-white truncate drop-shadow-sm">
          {label}
        </div>
        <div className="text-[10px] text-white/80 tabular-nums mt-0.5">
          {count} {count === 1 ? "voiture" : "voitures"}
        </div>
      </div>
    </button>
  );
}

function ClassicSectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="px-4 flex items-center gap-2">
      <h2 className="font-extrabold text-[15px]">{label}</h2>
      <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
        {count}
      </span>
    </div>
  );
}

function ChipStrip({
  eyebrow,
  items,
}: {
  eyebrow: string;
  items: Array<{
    key: string;
    label: string;
    count: number;
    icon?: LucideIcon;
    onClick: () => void;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)] mb-2 inline-flex items-center gap-1.5">
        <SlidersHorizontal className="h-3 w-3" />
        {eyebrow}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={it.onClick}
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--gold-soft)] hover:bg-[var(--gold-faint)] transition-colors group"
            >
              {Icon && (
                <Icon className="h-3.5 w-3.5 text-[var(--foreground-muted)] group-hover:text-[var(--gold)] transition-colors" />
              )}
              <span className="text-[12px] font-bold">{it.label}</span>
              <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
                {it.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Build a filter-aware empty-state title so the user knows WHY nothing
 *  is showing instead of a generic "no auctions". Prefers the most
 *  specific signal: search > brand > body > fallback. */
function buildEmptyTitle({
  search,
  brand,
  body,
}: {
  search: string;
  brand: string | null;
  body: string | null;
}): string {
  const q = search.trim();
  if (q && brand) return `Aucune ${brand} ne correspond à « ${q} »`;
  if (q) return `Aucun résultat pour « ${q} »`;
  if (brand && body) return `Aucune ${brand} ${body}`;
  if (brand) return `Aucune ${brand} en vente`;
  if (body) return `Aucune ${body}`;
  return "Aucune enchère";
}
