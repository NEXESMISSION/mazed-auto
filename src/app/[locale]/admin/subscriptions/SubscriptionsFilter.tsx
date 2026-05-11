"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export function SubscriptionsFilter({
  plans,
  currentPlan,
  includeInactive,
  currentQuery,
}: {
  plans: { slug: string; name_fr: string }[];
  currentPlan: string;
  includeInactive: boolean;
  currentQuery: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(currentQuery);

  function pushParams(opts: {
    plan?: string;
    inactive?: boolean;
    query?: string;
  }) {
    const search = new URLSearchParams();
    const p = opts.plan ?? currentPlan;
    const i = opts.inactive ?? includeInactive;
    const qry = opts.query ?? q;
    if (p) search.set("plan", p);
    if (i) search.set("include_inactive", "1");
    if (qry.trim()) search.set("q", qry.trim());
    const qs = search.toString();
    router.push(qs ? `/admin/subscriptions?${qs}` : "/admin/subscriptions");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pushParams({ query: q });
        }}
        className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] h-9 px-2.5 focus-within:border-[var(--gold-soft)] transition-colors min-w-[240px]"
      >
        <Search className="h-3.5 w-3.5 text-[var(--foreground-muted)] shrink-0" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Email ou nom…"
          className="bg-transparent flex-1 text-sm focus:outline-none min-w-0 placeholder:text-[var(--foreground-subtle)]"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              pushParams({ query: "" });
            }}
            className="text-xs text-[var(--foreground-muted)] hover:text-foreground"
            aria-label="Effacer"
          >
            ✕
          </button>
        )}
      </form>
      <select
        value={currentPlan}
        onChange={(e) => pushParams({ plan: e.target.value })}
        className="h-9 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-2 text-sm focus:outline-none focus:border-[var(--gold)]"
      >
        <option value="">Tous les plans</option>
        {plans.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name_fr}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-2 text-xs h-9 px-3 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] cursor-pointer">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => pushParams({ inactive: e.target.checked })}
        />
        Inclure annulés / expirés
      </label>
    </div>
  );
}
