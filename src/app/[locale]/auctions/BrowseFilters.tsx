"use client";

import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type StatusFilter = "live" | "finished" | "all";
export type FuelFilter =
  | "any"
  | "gasoline"
  | "diesel"
  | "hybrid"
  | "electric";
export type ConditionFilter =
  | "any"
  | "new"
  | "excellent"
  | "good"
  | "fair"
  | "damaged";

export interface BrowseFilterState {
  status: StatusFilter;
  fuel: FuelFilter;
  condition: ConditionFilter;
  minPrice: string; // raw input — parsed when applied
  maxPrice: string;
  minYear: string;
  maxYear: string;
  maxKm: string;
}

export const EMPTY_FILTERS: BrowseFilterState = {
  status: "live",
  fuel: "any",
  condition: "any",
  minPrice: "",
  maxPrice: "",
  minYear: "",
  maxYear: "",
  maxKm: "",
};

/** Cheap diff against EMPTY — drives the dot on the trigger pill. */
export function countActiveFilters(f: BrowseFilterState): number {
  let n = 0;
  if (f.status !== "live") n++;
  if (f.fuel !== "any") n++;
  if (f.condition !== "any") n++;
  if (f.minPrice) n++;
  if (f.maxPrice) n++;
  if (f.minYear) n++;
  if (f.maxYear) n++;
  if (f.maxKm) n++;
  return n;
}

interface Props {
  value: BrowseFilterState;
  onChange: (v: BrowseFilterState) => void;
}

const FUELS: { v: FuelFilter; l: string }[] = [
  { v: "any", l: "Tous" },
  { v: "gasoline", l: "Essence" },
  { v: "diesel", l: "Diesel" },
  { v: "hybrid", l: "Hybride" },
  { v: "electric", l: "Électrique" },
];
const CONDITIONS: { v: ConditionFilter; l: string }[] = [
  { v: "any", l: "Tout" },
  { v: "new", l: "Neuf" },
  { v: "excellent", l: "Excellent" },
  { v: "good", l: "Bon" },
  { v: "fair", l: "Acceptable" },
  { v: "damaged", l: "Endommagé" },
];
const STATUSES: { v: StatusFilter; l: string }[] = [
  { v: "live", l: "En direct" },
  { v: "finished", l: "Terminées" },
  { v: "all", l: "Tout afficher" },
];

export function BrowseFilters({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // Local draft so the user can tweak then "Apply" or "Cancel" without
  // mutating the live filter state on every keystroke.
  const [draft, setDraft] = useState<BrowseFilterState>(value);

  // Re-sync the draft whenever the modal opens or the upstream value
  // changes (e.g. URL navigation flipped a brand).
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const active = countActiveFilters(value);

  function apply() {
    onChange(draft);
    setOpen(false);
  }
  function reset() {
    setDraft(EMPTY_FILTERS);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-10 px-3.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--gold-soft)] inline-flex items-center gap-2 text-sm font-semibold transition-colors"
      >
        <Filter className="h-4 w-4 text-[var(--gold)]" />
        Filtres
        {active > 0 && (
          <span className="ms-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold tabular-nums">
            {active}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filtres"
        description="Affinez les résultats"
        size="lg"
      >
        <div className="space-y-5">
          <FieldGroup label="Statut">
            <PillRow
              options={STATUSES}
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
            />
          </FieldGroup>

          <FieldGroup label="Prix (DT)">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Min"
                inputMode="numeric"
                value={draft.minPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    minPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
              <Input
                placeholder="Max"
                inputMode="numeric"
                value={draft.maxPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Année">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Min"
                inputMode="numeric"
                value={draft.minYear}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    minYear: e.target.value.replace(/\D/g, "").slice(0, 4),
                  })
                }
              />
              <Input
                placeholder="Max"
                inputMode="numeric"
                value={draft.maxYear}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxYear: e.target.value.replace(/\D/g, "").slice(0, 4),
                  })
                }
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Kilométrage max">
            <Input
              placeholder="km"
              inputMode="numeric"
              value={draft.maxKm}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxKm: e.target.value.replace(/\D/g, ""),
                })
              }
            />
          </FieldGroup>

          <FieldGroup label="Carburant">
            <PillRow
              options={FUELS}
              value={draft.fuel}
              onChange={(v) => setDraft({ ...draft, fuel: v })}
            />
          </FieldGroup>

          <FieldGroup label="État">
            <PillRow
              options={CONDITIONS}
              value={draft.condition}
              onChange={(v) => setDraft({ ...draft, condition: v })}
            />
          </FieldGroup>
        </div>

        <ModalFooter className="-mx-5 -mb-5 mt-5">
          <Button variant="ghost" size="md" onClick={reset}>
            <X className="h-4 w-4" />
            Réinitialiser
          </Button>
          <Button size="md" onClick={apply}>
            Appliquer
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function PillRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-3 h-8 rounded-full text-xs font-semibold transition-colors border ${
              active
                ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                : "bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--gold-soft)]"
            }`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}
