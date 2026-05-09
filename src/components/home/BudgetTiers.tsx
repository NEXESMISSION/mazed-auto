import { Link } from "@/i18n/navigation";
import { Banknote } from "lucide-react";
import type { Auction } from "@/lib/types";

interface Tier {
  label: string;
  /** Inclusive bounds in DT. Open-ended on either side via 0 / Infinity. */
  min: number;
  max: number;
}

const TIERS: Tier[] = [
  { label: "Sous 30 000", min: 0, max: 30_000 },
  { label: "30 — 50k", min: 30_000, max: 50_000 },
  { label: "50 — 80k", min: 50_000, max: 80_000 },
  { label: "80 — 150k", min: 80_000, max: 150_000 },
  { label: "150k+", min: 150_000, max: Number.POSITIVE_INFINITY },
];

/**
 * "Par budget" — a horizontal row of clickable budget chips. Different
 * visual rhythm than the carousel rails (no images, no countdowns), so
 * the home doesn't read as five carousels in a row. Each chip links to
 * /auctions with no filter for now (the browse page already supports
 * its own price filter via the BrowseFilters modal).
 *
 * Live counts are computed from the live pool the home page already
 * fetched, so this rail costs zero extra DB roundtrips.
 */
interface Props {
  pool: Auction[];
}

export function BudgetTiers({ pool }: Props) {
  if (pool.length === 0) return null;

  const counts = TIERS.map((t) => ({
    ...t,
    count: pool.filter(
      (a) => a.currentPrice >= t.min && a.currentPrice < t.max,
    ).length,
  }));

  return (
    <section className="mt-7">
      <div className="px-4 mb-3 flex items-center gap-1.5">
        <Banknote className="h-4 w-4 text-[var(--gold)]" />
        <h2 className="text-base font-bold text-foreground">Par budget</h2>
        <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
          (DT)
        </span>
      </div>

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-2 px-4 pb-1">
          {counts.map((t) => (
            <Link
              key={t.label}
              href="/auctions"
              className="group shrink-0 inline-flex items-center gap-2 px-4 h-12 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="font-bold text-sm">{t.label}</span>
              <span
                className={`min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-extrabold tabular-nums flex items-center justify-center ${
                  t.count > 0
                    ? "bg-[var(--gold)] text-black"
                    : "bg-[var(--surface-2)] text-[var(--foreground-subtle)] border border-[var(--border)]"
                }`}
              >
                {t.count}
              </span>
            </Link>
          ))}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}
