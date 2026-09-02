"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Car, Wrench, Search, X, SlidersHorizontal } from "lucide-react";

/**
 * The filters, in the order a buyer narrows down.
 *
 * The category switch comes first because someone shopping for a car and
 * someone shopping for a brake pad share nothing else: different fields,
 * different price ranges, different questions. Everything below it changes with
 * that choice — and for Pièces, the "compatible avec" row appears, which is the
 * only filter that matters on a parts marketplace.
 */

type Current = {
  kind: string; cat: string; gov: string; q: string;
  make: string; model: string; year: string; max: string;
};

export function AnnonceFilters({
  categories,
  governorates,
  current,
}: {
  categories: { id: string; label: string; kind: string }[];
  governorates: string[];
  current: Current;
}) {
  const router = useRouter();
  const [f, setF] = useState<Current>(current);
  const [open, setOpen] = useState(false);

  const isPart = f.kind === "part";

  function apply(next: Partial<Current>) {
    const merged = { ...f, ...next };
    // Switching kind clears a category from the other branch, which would
    // otherwise return nothing and look broken.
    if (next.kind !== undefined && next.kind !== f.kind) merged.cat = "";
    setF(merged);

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, String(v));
    router.push(`/annonces${qs.toString() ? `?${qs}` : ""}` as never);
  }

  const activeCount = [f.cat, f.gov, f.q, f.make, f.max].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Kind switch */}
      <div className="flex gap-2">
        {[
          { v: "", label: "Tout", Icon: SlidersHorizontal },
          { v: "vehicle", label: "Véhicules", Icon: Car },
          { v: "part", label: "Pièces", Icon: Wrench },
        ].map(({ v, label, Icon }) => (
          <button
            key={v || "all"}
            type="button"
            onClick={() => apply({ kind: v })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition",
              f.kind === v
                ? "bg-[var(--gold)] text-white"
                : "bg-surface text-muted ring-1 ring-border hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Search + toggle */}
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && apply({})}
            placeholder={isPart ? "Plaquettes, alternateur, phare…" : "Clio, Golf, Hilux…"}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-[13.5px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold transition",
            activeCount > 0
              ? "bg-gold-faint text-gold ring-1 ring-gold-soft"
              : "bg-surface text-muted ring-1 ring-border",
          )}
        >
          <SlidersHorizontal className="size-4" />
          {activeCount > 0 ? activeCount : "Filtres"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <Label>Catégorie</Label>
              <select value={f.cat} onChange={(e) => apply({ cat: e.target.value })} className={INPUT}>
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>Gouvernorat</Label>
              <select value={f.gov} onChange={(e) => apply({ gov: e.target.value })} className={INPUT}>
                <option value="">Tous</option>
                {governorates.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="block">
              <Label>Prix max (TND)</Label>
              <input
                type="number"
                inputMode="decimal"
                value={f.max}
                onChange={(e) => setF({ ...f, max: e.target.value })}
                onBlur={() => apply({})}
                className={INPUT}
              />
            </label>
          </div>

          {isPart && (
            <div className="rounded-xl bg-gold-faint/40 p-3 ring-1 ring-gold-soft">
              <Label>Compatible avec mon véhicule</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <input
                  placeholder="Marque"
                  value={f.make}
                  onChange={(e) => setF({ ...f, make: e.target.value })}
                  className={INPUT}
                />
                <input
                  placeholder="Modèle"
                  value={f.model}
                  onChange={(e) => setF({ ...f, model: e.target.value })}
                  className={INPUT}
                />
                <input
                  placeholder="Année"
                  inputMode="numeric"
                  value={f.year}
                  onChange={(e) => setF({ ...f, year: e.target.value })}
                  className={INPUT}
                />
              </div>
              <button
                type="button"
                onClick={() => apply({})}
                className="batta-btn-luxe tap-target mt-2.5 w-full px-4 py-2 text-[13px]"
              >
                Chercher les pièces compatibles
              </button>
            </div>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() =>
                apply({ cat: "", gov: "", q: "", make: "", model: "", year: "", max: "" })
              }
              className="inline-flex items-center gap-1 text-[12px] font-bold text-muted hover:text-foreground"
            >
              <X className="size-3.5" /> Tout effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}
