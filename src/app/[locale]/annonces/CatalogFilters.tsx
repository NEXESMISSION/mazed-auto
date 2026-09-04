"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CAR_MAKES, FUELS, TRANSMISSIONS, modelsFor } from "@/lib/vehicles";
import {
  ArrowDownWideNarrow, Car, Check, LayoutGrid, Search, SlidersHorizontal, Wrench, X,
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
  min: string; max: string; fuel: string; boite: string; sort: string;
};

export const EMPTY: FilterState = {
  kind: "", cat: "", gov: "", q: "", make: "", model: "", year: "",
  min: "", max: "", fuel: "", boite: "", sort: "",
};

export const SORTS = [
  { v: "", label: "Les plus récentes" },
  { v: "price_asc", label: "Prix croissant" },
  { v: "price_desc", label: "Prix décroissant" },
] as const;

type Props = {
  categories: { id: string; label: string; kind: string }[];
  governorates: string[];
  current: FilterState;
  total: number;
};

function toQuery(f: FilterState) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, String(v));
  return qs.toString();
}

/** Human labels for the active-filter chips. */
function chipsFor(f: FilterState, categories: Props["categories"]): {
  key: keyof FilterState; label: string;
}[] {
  const out: { key: keyof FilterState; label: string }[] = [];
  if (f.q) out.push({ key: "q", label: `« ${f.q} »` });
  if (f.cat) {
    const c = categories.find((x) => x.id === f.cat);
    if (c) out.push({ key: "cat", label: c.label });
  }
  if (f.gov) out.push({ key: "gov", label: f.gov });
  if (f.min) out.push({ key: "min", label: `à partir de ${f.min} TND` });
  if (f.max) out.push({ key: "max", label: `jusqu'à ${f.max} TND` });
  if (f.fuel) out.push({ key: "fuel", label: FUELS.find((x) => x.value === f.fuel)?.label ?? f.fuel });
  if (f.boite) {
    out.push({ key: "boite", label: TRANSMISSIONS.find((x) => x.value === f.boite)?.label ?? f.boite });
  }
  if (f.make) {
    const bits = [f.make, f.model, f.year].filter(Boolean).join(" ");
    out.push({ key: "make", label: `compatible ${bits}` });
  }
  return out;
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

  useEffect(() => setF(current), [current]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function commit(merged: FilterState) {
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

  return { f, setF, push, pushDebounced, pending, router };
}

/** The filter controls themselves — shared by the desktop rail and the sheet. */
function FilterBody({
  categories, governorates, current,
}: Omit<Props, "total">) {
  const { f, setF, push, pushDebounced, pending, router } = useFilters(current);
  const isPart = f.kind === "part";
  const activeCount = chipsFor(f, categories).length;
  const visibleCats = categories.filter((c) => !f.kind || c.kind === f.kind);

  return (
    <div className={cn("space-y-5 transition-opacity", pending && "opacity-60")}>
      <Group label="Je cherche">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: "", label: "Tout", Icon: LayoutGrid },
            { v: "vehicle", label: "Véhicules", Icon: Car },
            { v: "part", label: "Pièces", Icon: Wrench },
          ].map(({ v, label, Icon }) => (
            <button
              key={v || "all"}
              type="button"
              onClick={() => push({ kind: v })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] font-bold transition",
                f.kind === v
                  ? "border-gold bg-gold-faint text-gold"
                  : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Catégorie">
        <select value={f.cat} onChange={(e) => push({ cat: e.target.value })} className={INPUT}>
          <option value="">Toutes les catégories</option>
          {visibleCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Group>

      <Group label="Gouvernorat">
        <select value={f.gov} onChange={(e) => push({ gov: e.target.value })} className={INPUT}>
          <option value="">Toute la Tunisie</option>
          {governorates.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </Group>

      <Group label="Budget (TND)">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number" inputMode="numeric" placeholder="Min"
            value={f.min}
            onChange={(e) => pushDebounced({ min: e.target.value })}
            onBlur={() => push({})}
            onKeyDown={(e) => e.key === "Enter" && push({})}
            className={INPUT}
          />
          <input
            type="number" inputMode="numeric" placeholder="Max"
            value={f.max}
            onChange={(e) => pushDebounced({ max: e.target.value })}
            onBlur={() => push({})}
            onKeyDown={(e) => e.key === "Enter" && push({})}
            className={INPUT}
          />
        </div>
      </Group>

      {!isPart && (
        <>
          {/* Marque and modèle existed ONLY in the parts branch, as
              "compatible avec ma voiture" — so someone browsing cars, which is
              most of the catalogue, had no way to filter by make at all. They
              were also <datalist> inputs writing to local state, which is why
              picking one appeared to do nothing: the value changed and the
              results never moved. Selects, and they commit. */}
          <Group label="Marque">
            <select
              value={f.make}
              onChange={(e) => push({ make: e.target.value, model: "" })}
              className={INPUT}
            >
              <option value="">Toutes les marques</option>
              {CAR_MAKES.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </Group>

          {f.make && modelsFor(f.make).length > 0 && (
            <Group label="Modèle">
              <select
                value={f.model}
                onChange={(e) => push({ model: e.target.value })}
                className={INPUT}
              >
                <option value="">Tous les modèles</option>
                {modelsFor(f.make).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Group>
          )}

          <Group label="Carburant">
            <Pills
              value={f.fuel}
              options={FUELS.map((x) => ({ v: x.value, label: x.label }))}
              onPick={(v) => push({ fuel: v })}
            />
          </Group>
          <Group label="Boîte">
            <Pills
              value={f.boite}
              options={TRANSMISSIONS.map((x) => ({ v: x.value, label: x.label }))}
              onPick={(v) => push({ boite: v })}
            />
          </Group>
        </>
      )}

      {isPart && (
        <div className="rounded-2xl bg-gold-faint/40 p-3.5 ring-1 ring-gold-soft">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-gold">
            Compatible avec ma voiture
          </span>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            La seule question qui compte sur une pièce : est-ce qu&apos;elle se monte
            sur la vôtre.
          </p>
          <div className="mt-2.5 space-y-2">
            <input
              list="cf-makes" placeholder="Marque" value={f.make}
              onChange={(e) => pushDebounced({ make: e.target.value, model: "" })}
              className={INPUT}
            />
            <datalist id="cf-makes">
              {CAR_MAKES.map((m) => <option key={m.name} value={m.name} />)}
            </datalist>
            <div className="grid grid-cols-2 gap-2">
              <input
                list="cf-models" placeholder="Modèle" value={f.model}
                onChange={(e) => pushDebounced({ model: e.target.value })}
                className={INPUT}
              />
              <datalist id="cf-models">
                {modelsFor(f.make).map((m) => <option key={m} value={m} />)}
              </datalist>
              <input
                placeholder="Année" inputMode="numeric" value={f.year}
                onChange={(e) => setF({ ...f, year: e.target.value })}
                className={INPUT}
              />
            </div>
            <button
              type="button"
              onClick={() => push({})}
              className="batta-btn-luxe tap-target w-full px-4 py-2.5 text-[13px]"
            >
              Voir les pièces compatibles
            </button>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => router.push("/annonces" as never)}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted hover:text-foreground"
        >
          <X className="size-3.5" /> Effacer tous les filtres
        </button>
      )}
    </div>
  );
}

/** The always-open rail beside the results, lg and up. */
export function CatalogSidebar(props: Omit<Props, "total">) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[calc(var(--desktop-nav-h,64px)+1rem)] rounded-2xl border border-border bg-surface p-4">
        <FilterBody {...props} />
      </div>
    </aside>
  );
}

/**
 * Search, result count, sort and the active-filter chips — the row above the
 * results — plus the mobile filter sheet, whose trigger lives here.
 */
export function CatalogToolbar({ categories, governorates, current, total }: Props) {
  const { f, push, pushDebounced, pending } = useFilters(current);
  const [sheet, setSheet] = useState(false);
  const isPart = f.kind === "part";
  const chips = chipsFor(f, categories);
  const activeCount = chips.length;

  // A sheet open behind a scrolling page is how you lose your place.
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [sheet]);

  return (
    <>
      {/* ── Search + sort: the row everyone uses, on every screen ── */}
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={f.q}
            onChange={(e) => pushDebounced({ q: e.target.value })}
            // Enter still commits immediately for anyone who expects it to.
            onKeyDown={(e) => e.key === "Enter" && push({})}
            placeholder={isPart ? "Plaquettes, alternateur, phare…" : "Clio, Golf, Hilux…"}
            className="h-12 w-full rounded-xl border border-border bg-surface ps-9 pe-3 text-[14px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </label>

        {/* Mobile: open the sheet. Desktop: the rail is already open. */}
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={cn(
            "inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-[13px] font-bold transition lg:hidden",
            activeCount > 0
              ? "bg-gold-faint text-gold ring-1 ring-gold-soft"
              : "bg-surface text-foreground ring-1 ring-border",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filtres
          {activeCount > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-[var(--gold)] text-[10px] font-extrabold text-black">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Count + sort ── */}
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
          <span className={pending ? "text-muted" : undefined}>
            {pending
              ? "Mise à jour…"
              : total === 0
                ? "Aucun résultat"
                : `${total} annonce${total > 1 ? "s" : ""}`}
          </span>
        </p>
        <label className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
          <ArrowDownWideNarrow className="size-3.5" />
          <select
            value={f.sort}
            onChange={(e) => push({ sort: e.target.value })}
            className="cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-[12.5px] font-semibold text-foreground focus:border-gold focus:outline-none"
          >
            {SORTS.map((s) => <option key={s.v || "recent"} value={s.v}>{s.label}</option>)}
          </select>
        </label>
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

      {/* ── Mobile sheet ── */}
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
          <button
            aria-label="Fermer les filtres"
            onClick={() => setSheet(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col rounded-t-3xl border-t border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[15px] font-extrabold">Filtres</span>
              <button
                onClick={() => setSheet(false)}
                aria-label="Fermer"
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
                Voir {total} annonce{total > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const INPUT =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none";

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
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
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onPick(value === o.v ? "" : o.v)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[12.5px] font-bold transition",
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
