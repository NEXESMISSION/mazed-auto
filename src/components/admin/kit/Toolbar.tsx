"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

/**
 * The bar above every list: status tabs, debounced search, optional date
 * range, and the result count.
 *
 * It owns no state of its own beyond the text being typed — everything lives
 * in the URL, which the server page reads. That is what keeps filtering,
 * sorting and pagination server-side (the only way these queues survive a
 * few hundred rows a day), and it means a filtered view is a link you can
 * bookmark or send to someone.
 *
 * Two things the old `AdminQueryBar` got wrong and this fixes: navigation
 * ran without a pending state, so a slow filter looked like a dead click;
 * and it always rendered the date range, on screens where filtering by date
 * means nothing.
 */

export type Tab = { value: string; label: string; count?: number };

const RANGES = [
  { key: "", label: "Tout" },
  { key: "1", label: "Aujourd'hui" },
  { key: "7", label: "7 j" },
  { key: "30", label: "30 j" },
];

export function Toolbar({
  tabs,
  tabParam = "status",
  defaultTab,
  search = true,
  searchPlaceholder = "Rechercher…",
  ranges = false,
  total,
}: {
  tabs?: Tab[];
  /** Query param the tabs write to. */
  tabParam?: string;
  /** Which tab is active when the param is absent. */
  defaultTab?: string;
  search?: boolean;
  searchPlaceholder?: string;
  ranges?: boolean;
  total?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const activeTab = sp.get(tabParam) ?? defaultTab ?? tabs?.[0]?.value ?? "";
  const range = sp.get("range") ?? "";

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // Any filter change invalidates the page cursor, and closes an open panel:
    // the row it was showing may not be in the new result set.
    params.delete("page");
    params.delete("panel");
    const qs = params.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // Debounce typing. The mount pass is skipped so arriving on a page with
  // ?q= already set doesn't immediately re-navigate to itself.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => push({ q: q.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {tabs && tabs.length > 0 && (
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
          {tabs.map((t) => {
            const active = t.value === activeTab;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => push({ [tabParam]: t.value })}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
                  active
                    ? "bg-[var(--gold)] text-black"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className={`batta-tabular rounded px-1 text-[10px] font-bold ${
                      active ? "bg-black/15 text-black" : "bg-surface-3 text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {search && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-56 rounded-lg border border-border bg-surface ps-9 pe-8 text-[13px] text-foreground placeholder:text-subtle focus:border-gold focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Effacer la recherche"
              className="absolute end-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}

      {ranges && (
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => push({ range: r.key || null })}
              aria-pressed={range === r.key}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
                range === r.key
                  ? "bg-[var(--gold)] text-black"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <span className="batta-tabular ms-auto inline-flex items-center gap-2 text-[12px] text-muted">
        {pending && <Loader2 className="size-3.5 animate-spin text-gold" />}
        {total != null && (
          <>
            {total.toLocaleString("fr-FR")} résultat{total === 1 ? "" : "s"}
          </>
        )}
      </span>
    </div>
  );
}
