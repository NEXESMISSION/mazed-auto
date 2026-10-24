"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, SearchSweep, SearchStatus } from "@/components/ui/SearchBusy";

/** Period filters; `label` names the key under `admin.kit.ranges`. */
const RANGES = [
  { key: "", label: "all" },
  { key: "1", label: "today" },
  { key: "7", label: "days7" },
  { key: "30", label: "days30" },
];

/**
 * Shared admin queue toolbar: debounced free-text search + a date-range
 * segmented control + a live result count. Drives the URL (?q, ?range)
 * which the server page reads — so search/filter/pagination are all
 * server-side, the only way these queues survive hundreds of rows/day.
 * Preserves any other params (e.g. ?status=) and resets ?page on change.
 */
export function AdminQueryBar({
  total,
  placeholder: placeholderProp,
}: {
  total: number;
  placeholder?: string;
}) {
  const t = useTranslations("admin.kit");
  const placeholder = placeholderProp ?? t("search");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const range = sp.get("range") ?? "";
  // True from the moment a query is committed until its results render.
  const [searching, startSearch] = useTransition();

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    startSearch(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Debounced search — skip the mount so we don't refetch the SSR page.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => push({ q: q.trim() || null }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="relative overflow-hidden rounded-lg">
        <SearchIcon
          active={searching}
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <SearchSweep active={searching} />
        <SearchStatus active={searching} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-64 rounded-lg border border-border bg-surface ps-9 pe-3 text-[13px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
        />
      </div>

      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => push({ range: r.key || null })}
            className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
              range === r.key ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {t(`ranges.${r.label}`)}
          </button>
        ))}
      </div>

      <span className="batta-tabular ms-auto text-[12px] text-muted">
        {t("results", { count: total })}
      </span>
    </div>
  );
}
