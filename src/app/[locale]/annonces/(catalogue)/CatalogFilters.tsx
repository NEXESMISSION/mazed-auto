"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RouteProgress, useFilteringFlag } from "@/components/ui/RouteProgress";
import { useRouter } from "@/i18n/navigation";
import { useScrollLock } from "@/lib/scrollLock";
import { cn, formatTND } from "@/lib/utils";
import { Overlay, LAYER } from "@/components/ui/Overlay";
import { SuggestInput } from "@/components/ui/SuggestInput";
import { CAR_MAKES, CONDITIONS, FUELS, TRANSMISSIONS, modelsFor, optionLabel } from "@/lib/vehicles";
import { rangeProblems } from "@/lib/catalog/ranges";
import {
  ArrowDownWideNarrow, Car, Check, LayoutGrid, PlaySquare, Search,
  SlidersHorizontal, Wrench, X,
} from "lucide-react";

/**
 * The catalog controls, built the way every classifieds site that works is
 * built — because buyers already know those, and a marketplace is the wrong
 * place to be inventive with navigation.
 *
 *   • DESKTOP keeps the filters open in a rail beside the results. The old
 *     page hid everything behind a "Filtres" button, so the page looked like it
 *     had two filters when it has eight, and you had to open a panel to find
 *     out what you were already filtering by.
 *   • MOBILE gets a full-screen sheet instead, because a sidebar on a phone is
 *     a sidebar nobody sees — with the apply button pinned to the bottom where
 *     a thumb is.
 *   • ACTIVE FILTERS are chips you can remove one at a time. Knowing why a
 *     result set is small matters more than the filters themselves.
 *   • SORT sits next to the count, not inside the filter panel: it is the one
 *     control people reach for without wanting to change anything else.
 *
 * Every change writes to the URL and lets the server re-query. No client-side
 * filtering — the result count has to be the real one, and the page has to be
 * shareable.
 */

export type FilterState = {
  kind: string; cat: string; gov: string; q: string;
  make: string; model: string; year: string;
  min: string; max: string; fuel: string; boite: string; etat: string; sort: string;
  year_min: string; year_max: string; km_max: string;
  /**
   * "" = the grid, "reels" = the vertical feed.
   *
   * Carried in FilterState rather than handled separately, because `toQuery`
   * serialises this whole object: narrowing to Peugeot while in the feed has
   * to leave you in the feed, and a filter change that silently threw you back
   * to the grid would be the most annoying bug on this page.
   */
  view: string;
};

export const EMPTY: FilterState = {
  kind: "", cat: "", gov: "", q: "", make: "", model: "", year: "",
  min: "", max: "", fuel: "", boite: "", etat: "", sort: "",
  year_min: "", year_max: "", km_max: "", view: "",
};

/** Sort orders, with the key of their label under `catalog.filters.sort`. */
export const SORTS = [
  { v: "", key: "recent" },
  { v: "price_asc", key: "priceAsc" },
  { v: "price_desc", key: "priceDesc" },
] as const;

type Props = {
  categories: { id: string; label: string; kind: string }[];
  /** `value` is the French name the listings store; `label` is in the reader's language. */
  governorates: { value: string; label: string }[];
  current: FilterState;
  total: number;
  /**
   * The feed's variant: one slim row — filters, count, view toggle — because
   * every pixel here is a pixel taken off the photo below it. Same component,
   * and therefore the same filter sheet: a second copy of that sheet is how
   * two views end up filtering differently.
   */
  compact?: boolean;
};

function toQuery(f: FilterState) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, String(v));
  return qs.toString();
}

type Chip = { key: keyof FilterState; label: string };

/** Human labels for the active-filter chips, in the reader's language. */
function useChips() {
  const t = useTranslations("catalog.filters.chips");
  const locale = useLocale();
  return (f: FilterState, categories: Props["categories"], governorates: Props["governorates"]): Chip[] => {
    const out: Chip[] = [];
    if (f.q) out.push({ key: "q", label: `« ${f.q} »` });
    if (f.cat) {
      const c = categories.find((x) => x.id === f.cat);
      if (c) out.push({ key: "cat", label: c.label });
    }
    if (f.gov) out.push({ key: "gov", label: governorates.find((g) => g.value === f.gov)?.label ?? f.gov });
    if (f.min) out.push({ key: "min", label: t("from", { amount: f.min }) });
    if (f.max) out.push({ key: "max", label: t("upTo", { amount: f.max }) });
    if (f.fuel) out.push({ key: "fuel", label: optionLabel(FUELS, f.fuel, locale) ?? f.fuel });
    if (f.etat) out.push({ key: "etat", label: optionLabel(CONDITIONS, f.etat, locale) ?? f.etat });
    if (f.year_min || f.year_max) {
      out.push({
        key: "year_min",
        label:
          f.year_min && f.year_max
            ? `${f.year_min}–${f.year_max}`
            : f.year_min
              ? t("since", { year: f.year_min })
              : t("until", { year: f.year_max }),
      });
    }
    if (f.km_max) out.push({ key: "km_max", label: t("kmMax", { km: formatTND(Number(f.km_max), locale) }) });
    if (f.boite) {
      out.push({ key: "boite", label: optionLabel(TRANSMISSIONS, f.boite, locale) ?? f.boite });
    }
    if (f.make) {
      // On a part, make/model/year say which car it fits; on a car, which car
      // it is — « compatible avec Renault » read like a spare part.
      const label = f.kind === "part"
        ? t("compatible", { car: [f.make, f.model, f.year].filter(Boolean).join(" ") })
        : f.model ? `${f.make} ${f.model}` : t("make", { car: f.make });
      out.push({ key: "make", label });
    }
    return out;
  };
}

/**
 * Both placements drive the same URL, so each keeps its own draft copy and
 * re-syncs whenever the server hands back a new `current`.
 */
function useFilters(current: FilterState) {
  const router = useRouter();
  const [f, setF] = useState<FilterState>(current);
  // `pending` is true while the server is fetching the next page of results.
  // React keeps the CURRENT results on screen for the whole transition, which
  // is the point: changing a filter used to blank the grid and throw you back
  // to the top of the page before anything arrived.
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync the draft filters when the URL-derived ones change (back button,
  // a chip cleared elsewhere). During render, not in an effect: the inputs
  // then show the new values on the SAME paint as the results they describe,
  // instead of lagging them by a frame.
  //
  // Only what the URL changed is taken, not the whole of it: copying it all
  // over the draft erased whatever was being typed elsewhere — fill « Min »,
  // move to « Max », and when the results for « Min » arrived they wiped the
  // « Max » just typed. Clearing all, Back and a removed chip still land,
  // since each changes the keys it is about.
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (prevCurrent !== current) {
    setPrevCurrent(current);
    setF((draft) => {
      const next = { ...draft };
      for (const k of Object.keys(current) as (keyof FilterState)[]) {
        if (current[k] !== prevCurrent[k]) next[k] = current[k];
      }
      return next;
    });
  }
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function commit(merged: FilterState) {
    // A minimum above its maximum is held back: applied, it would answer « no
    // results » for a typo. The fields say what is wrong (FilterBody) and every
    // other criterion stays as it was until the range is put right.
    if (rangeProblems(merged).length > 0) return;
    const qs = toQuery(merged);
    startTransition(() => {
      // replace, not push: a filter is not a page you meant to visit, and
      // pushing meant Back walked you through every checkbox you had ticked.
      // scroll:false keeps you where you were reading instead of yanking the
      // page to the top on every change.
      router.replace(`/annonces${qs ? `?${qs}` : ""}` as never, { scroll: false });
    });
  }

  function merge(next: Partial<FilterState>): FilterState {
    const merged = { ...f, ...next };
    // Switching kind keeps a category from the other branch, which would return
    // nothing and read as a broken page.
    if (next.kind !== undefined && next.kind !== f.kind) merged.cat = "";
    if (next.make !== undefined && next.make !== f.make) merged.model = "";
    return merged;
  }

  function push(next: Partial<FilterState>) {
    if (debounce.current) clearTimeout(debounce.current);
    const merged = merge(next);
    setF(merged);
    commit(merged);
  }

  /**
   * For things people TYPE. A round trip per keystroke made the price boxes
   * feel broken — each digit queued another query and the results churned
   * under the cursor. One request, 400 ms after they stop.
   */
  function pushDebounced(next: Partial<FilterState>) {
    const merged = merge(next);
    setF(merged);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => commit(merged), 400);
  }

  // Dims the server-rendered results while the next page is in flight.
  useFilteringFlag(pending);

  return { f, setF, push, pushDebounced, pending, router };
}

/** The filter controls themselves — shared by the desktop rail and the sheet. */
function FilterBody({
  categories, governorates, current,
}: Omit<Props, "total">) {
  const t = useTranslations("catalog.filters");
  const locale = useLocale();
  const chipsFor = useChips();
  const { f, setF, push, pushDebounced, pending, router } = useFilters(current);
  const isPart = f.kind === "part";
  const activeCount = chipsFor(f, categories, governorates).length;
  const visibleCats = categories.filter((c) => !f.kind || c.kind === f.kind);
  const bad = rangeProblems(f);
  const priceErrId = useId();
  const yearErrId = useId();

  // Everything is on screen. Folding marque/année/kilométrage/carburant behind
  // "Plus de filtres" hid exactly the controls that decide a used car, so the
  // panel looked like it could only filter by category, price and governorate.
  // The height that bought back is paid for instead by a tighter rhythm and by
  // pairing controls that belong together on one row.

  return (
    <div className="space-y-3.5">
      <RouteProgress active={pending} />
      <Group label={t("lookingFor")}>
        <div className="grid grid-cols-3 gap-1">
          {[
            { v: "", label: t("all"), Icon: LayoutGrid },
            { v: "vehicle", label: t("vehicles"), Icon: Car },
            { v: "part", label: t("parts"), Icon: Wrench },
          ].map(({ v, label, Icon }) => (
            <button
              key={v || "all"}
              type="button"
              onClick={() => push({ kind: v })}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold transition",
                f.kind === v
                  ? "border-gold bg-gold-faint text-gold"
                  : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group label={t("category")}>
        <select value={f.cat} onChange={(e) => push({ cat: e.target.value })} aria-label={t("category")} className={INPUT}>
          <option value="">{t("allCategories")}</option>
          {visibleCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Group>

      <Group label={t("governorate")}>
        <select value={f.gov} onChange={(e) => push({ gov: e.target.value })} aria-label={t("governorate")} className={INPUT}>
          <option value="">{t("allTunisia")}</option>
          {governorates.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </Group>

      <Group label={t("budget")}>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number" inputMode="numeric" placeholder={t("min")}
            aria-label={`${t("budget")} · ${t("min")}`}
            aria-invalid={bad.includes("price") || undefined}
            aria-describedby={bad.includes("price") ? priceErrId : undefined}
            value={f.min}
            onChange={(e) => pushDebounced({ min: e.target.value })}
            onBlur={() => push({})}
            onKeyDown={(e) => e.key === "Enter" && push({})}
            className={INPUT}
          />
          <input
            type="number" inputMode="numeric" placeholder={t("max")}
            aria-label={`${t("budget")} · ${t("max")}`}
            aria-invalid={bad.includes("price") || undefined}
            aria-describedby={bad.includes("price") ? priceErrId : undefined}
            value={f.max}
            onChange={(e) => pushDebounced({ max: e.target.value })}
            onBlur={() => push({})}
            onKeyDown={(e) => e.key === "Enter" && push({})}
            className={INPUT}
          />
        </div>
        {bad.includes("price") && <RangeError id={priceErrId}>{t("rangePrice")}</RangeError>}
      </Group>

      {!isPart && (
        <>
          {/* Marque and modèle existed ONLY in the parts branch, as
              "compatible avec ma voiture" — so someone browsing cars, which is
              most of the catalogue, had no way to filter by make at all. They
              were also <datalist> inputs writing to local state, which is why
              picking one appeared to do nothing: the value changed and the
              results never moved. Selects, and they commit. */}
          <Group label={t("make")}>
            <select
              value={f.make}
              onChange={(e) => push({ make: e.target.value, model: "" })}
              aria-label={t("make")}
              className={INPUT}
            >
              <option value="">{t("allMakes")}</option>
              {CAR_MAKES.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </Group>

          {f.make && modelsFor(f.make).length > 0 && (
            <Group label={t("model")}>
              <select
                value={f.model}
                onChange={(e) => push({ model: e.target.value })}
                aria-label={t("model")}
                className={INPUT}
              >
                <option value="">{t("allModels")}</option>
                {modelsFor(f.make).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Group>
          )}

          {/* Année and kilométrage are the same question asked twice — how
              used is it — and "2015 or newer, under 150 000 km" is one thought,
              not two. One row of three, which also buys back a whole group's
              height now that nothing folds away. */}
          <Group label={t("yearKm")}>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                inputMode="numeric" placeholder={t("from")} value={f.year_min}
                aria-label={t("yearMin")}
                aria-invalid={bad.includes("year") || undefined}
                aria-describedby={bad.includes("year") ? yearErrId : undefined}
                onChange={(e) => pushDebounced({ year_min: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className={INPUT}
              />
              <input
                inputMode="numeric" placeholder={t("to")} value={f.year_max}
                aria-label={t("yearMax")}
                aria-invalid={bad.includes("year") || undefined}
                aria-describedby={bad.includes("year") ? yearErrId : undefined}
                onChange={(e) => pushDebounced({ year_max: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className={INPUT}
              />
              <input
                inputMode="numeric" placeholder={t("km")} value={f.km_max}
                aria-label={t("kmMax")}
                onChange={(e) => pushDebounced({ km_max: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                className={INPUT}
              />
            </div>
            {bad.includes("year") && <RangeError id={yearErrId}>{t("rangeYear")}</RangeError>}
          </Group>

          {/* First of the vehicle groups: « neuf ou occasion » is the
              question a car buyer answers before fuel or gearbox, because it
              decides their whole budget. */}
          <Group label={t("condition")}>
            <Pills
              value={f.etat}
              options={CONDITIONS.map((x) => ({ v: x.value, label: optionLabel(CONDITIONS, x.value, locale) ?? x.label }))}
              onPick={(v) => push({ etat: v })}
            />
          </Group>
          <Group label={t("fuel")}>
            <Pills
              value={f.fuel}
              options={FUELS.map((x) => ({ v: x.value, label: optionLabel(FUELS, x.value, locale) ?? x.label }))}
              onPick={(v) => push({ fuel: v })}
            />
          </Group>
          <Group label={t("gearbox")}>
            <Pills
              value={f.boite}
              options={TRANSMISSIONS.map((x) => ({ v: x.value, label: optionLabel(TRANSMISSIONS, x.value, locale) ?? x.label }))}
              onPick={(v) => push({ boite: v })}
            />
          </Group>
        </>
      )}

      {isPart && (
        <div className="rounded-2xl bg-gold-faint/40 p-3.5 ring-1 ring-gold-soft">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-gold">
            {t("fitTitle")}
          </span>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {t("fitBody")}
          </p>
          <div className="mt-2.5 space-y-2">
            {/* Our own suggestion list, not a <datalist>, which most phone
                browsers show badly or not at all — see SuggestInput. */}
            <SuggestInput
              placeholder={t("make")} aria-label={t("make")} value={f.make}
              onChange={(v) => pushDebounced({ make: v, model: "" })}
              options={CAR_MAKES.map((m) => m.name)}
              className={INPUT}
            />
            <div className="grid grid-cols-2 gap-2">
              <SuggestInput
                placeholder={t("model")} aria-label={t("model")} value={f.model}
                onChange={(v) => pushDebounced({ model: v })}
                options={modelsFor(f.make)}
                className={INPUT}
              />
              <input
                placeholder={t("year")} aria-label={t("year")} inputMode="numeric" value={f.year}
                onChange={(e) => setF({ ...f, year: e.target.value })}
                className={INPUT}
              />
            </div>
            <button
              type="button"
              onClick={() => push({})}
              className="batta-btn-luxe tap-target w-full px-4 py-2.5 text-[13px]"
            >
              {t("fitCta")}
            </button>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          // The fields too, not only the URL: a range held back as backwards
          // was never in the URL, so clearing the URL alone left it on screen.
          onClick={() => { setF(EMPTY); router.push("/annonces" as never); }}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted hover:text-foreground"
        >
          <X className="size-3.5" /> {t("clearAll")}
        </button>
      )}
    </div>
  );
}

/** The always-open rail beside the results, lg and up. */
export function CatalogSidebar(props: Omit<Props, "total">) {
  return (
    <aside className="hidden lg:block">
      {/* Sticky was already here and did nothing useful: an element TALLER
          than the viewport still scrolls with the page until its bottom is
          reached, so getting to "Carburant" meant scrolling the whole results
          column past it. Capping the height and giving the rail its own
          scrollbar is what makes sticky mean "stays put". */}
      <div
        className="sticky top-[calc(var(--desktop-nav-h,64px)+1rem)] flex max-h-[calc(100dvh-var(--desktop-nav-h,64px)-2rem)] flex-col overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-4"
      >
        <FilterBody {...props} />
      </div>
    </aside>
  );
}

/**
 * Search, result count, sort and the active-filter chips — the row above the
 * results — plus the mobile filter sheet, whose trigger lives here.
 */
export function CatalogToolbar({
  categories, governorates, current, total, compact = false,
}: Props) {
  const t = useTranslations("catalog.filters");
  const tShared = useTranslations("shared");
  const chipsFor = useChips();
  const { f, push, pushDebounced, pending } = useFilters(current);
  const [sheet, setSheet] = useState(false);
  const sheetTitleId = useId();
  const isPart = f.kind === "part";
  const chips = chipsFor(f, categories, governorates);
  const activeCount = chips.length;

  // A sheet open behind a scrolling page is how you lose your place.
  // Reference-counted (see scrollLock): an alert opening over this sheet used
  // to leave the page unscrollable after both had closed.
  useScrollLock(sheet);

  /** Grille | Reels. Segmented, so the alternative is visible before it is used. */
  const viewToggle = (
    <div
      role="group"
      aria-label={t("view")}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {([
        { v: "", label: t("grid"), Icon: LayoutGrid },
        { v: "reels", label: t("reels"), Icon: PlaySquare },
      ] as const).map((o) => {
        const on = (f.view || "") === o.v;
        return (
          <button
            key={o.v || "grid"}
            type="button"
            onClick={() => push({ view: o.v })}
            aria-pressed={on}
            aria-label={o.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition",
              on
                ? "bg-gold-faint text-gold ring-1 ring-gold-soft"
                : "text-muted hover:text-foreground",
            )}
          >
            <o.Icon className="size-3.5" />
            {/* Icons alone on the narrowest phones: with the words, the toggle
                and the sort pushed the row ~50px past a 320px screen. */}
            <span className="hidden min-[360px]:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );

  // One sheet, rendered by whichever branch is active below. Lifted out of the
  // JSX rather than duplicated: two copies of the filter body is how the grid
  // and the feed would end up filtering differently.
  const sheetNode = (
    <Overlay open onClose={() => setSheet(false)} z={LAYER.modal} labelledBy={sheetTitleId} className="max-w-lg p-0 lg:hidden">
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={sheetTitleId} className="text-[15px] font-extrabold">{t("title")}</h2>
          <button
            onClick={() => setSheet(false)}
            aria-label={tShared("close")}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FilterBody
            categories={categories}
            governorates={governorates}
            current={current}
          />
        </div>

        <div className="border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setSheet(false)}
            className="batta-btn-luxe tap-target flex h-12 w-full items-center justify-center gap-2 text-[14px]"
          >
            <Check className="size-4" />
            {t("showResults", { count: total })}
          </button>
        </div>
      </div>
    </Overlay>
  );

  const filtersButton = (
    <button
      type="button"
      onClick={() => setSheet(true)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl font-bold transition lg:hidden",
        compact ? "h-9 shrink-0 rounded-full px-3 text-[12px]" : "h-12 px-4 text-[13px]",
        activeCount > 0
          ? "bg-gold-faint text-gold ring-1 ring-gold-soft"
          : "bg-surface text-foreground ring-1 ring-border",
      )}
    >
      <SlidersHorizontal className={compact ? "size-3.5" : "size-4"} />
      {t("title")}
      {activeCount > 0 && (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-[var(--gold)] font-extrabold text-black",
            compact ? "size-4 text-[9px]" : "size-5 text-[10px]",
          )}
        >
          {activeCount}
        </span>
      )}
    </button>
  );

  const countLabel = pending
    ? t("updating")
    : total === 0
      ? t("noResults")
      : t("count", { count: total });

  // ── The feed's slim row. Everything the grid's toolbar offers is still
  //    reachable (the sheet on a phone, the rail on desktop); what it gives up
  //    is the search box and the chips, which together are ~120px of a screen
  //    whose whole point is one photograph filling it.
  if (compact) {
    return (
      <>
        <RouteProgress active={pending} />
        <div className="flex items-center gap-2 px-4 py-2 lg:px-0">
          {filtersButton}
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-muted">
            {countLabel}
          </p>
          {viewToggle}
        </div>
        {sheet && sheetNode}
      </>
    );
  }

  return (
    <>
      <RouteProgress active={pending} />

      {/* ── Search + sort: the row everyone uses, on every screen ── */}
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={f.q}
            onChange={(e) => pushDebounced({ q: e.target.value })}
            // Enter still commits immediately for anyone who expects it to.
            onKeyDown={(e) => e.key === "Enter" && push({})}
            placeholder={isPart ? t("searchParts") : t("searchCars")}
            aria-label={t("search")}
            className="h-12 w-full rounded-xl border border-border bg-surface ps-9 pe-3 text-[14px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </label>

        {/* Mobile: open the sheet. Desktop: the rail is already open. */}
        {filtersButton}
      </div>

      {/* ── Count + view + sort ── */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {/* The count doubles as the progress indicator. During a transition the
            results below stay on screen — telling the user something is
            happening here is what stops a 400 ms wait reading as a dead click. */}
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
          {pending && (
            <span
              aria-hidden
              className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--gold)]"
            />
          )}
          <span className={pending ? "text-muted" : undefined}>{countLabel}</span>
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {viewToggle}
          <label className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            <ArrowDownWideNarrow className="size-3.5 shrink-0" />
            <select
              value={f.sort}
              onChange={(e) => push({ sort: e.target.value })}
              aria-label={t("sortBy")}
              className="cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-[12.5px] font-semibold text-foreground focus:border-gold focus:outline-none"
            >
              {SORTS.map((s) => <option key={s.v || "recent"} value={s.v}>{t(`sort.${s.key}`)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ── Active filters ── */}
      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                push(
                  c.key === "make"
                    ? { make: "", model: "", year: "" }
                    : ({ [c.key]: "" } as Partial<FilterState>),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-3 py-1.5 text-[12px] font-bold text-gold ring-1 ring-gold-soft"
            >
              {c.label}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}

      {/* ── Mobile sheet ──
          Centred like every other layer in the app, instead of a panel
          anchored to the bottom edge — see components/ui/Overlay. */}
      {sheet && sheetNode}
    </>
  );
}

const INPUT =
  "h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-foreground placeholder:text-muted transition-colors focus:border-gold focus:outline-none";

/** Said next to the fields it is about, and read out when it appears. */
function RangeError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-[11.5px] font-semibold leading-snug text-[var(--tone-warn)]">
      {children}
    </p>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-subtle">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Pills({
  value, options, onPick,
}: {
  value: string;
  options: { v: string; label: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onPick(value === o.v ? "" : o.v)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-bold transition",
            value === o.v
              ? "bg-[var(--gold)] text-black"
              : "bg-surface-2 text-muted ring-1 ring-border hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
