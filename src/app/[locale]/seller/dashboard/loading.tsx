import { AppShell } from "@/components/layout/AppShell";

/**
 * Skeleton for /seller/dashboard — title row with verified badge, 3-stat
 * grid, "publish new auction" CTA banner, then "my auctions" 2-col grid.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-6">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 rounded skeleton" />
            <div className="h-3 w-32 rounded skeleton" />
          </div>
          <div className="h-6 w-20 rounded-full skeleton" />
        </div>

        {/* 3-stat grid */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2">
              <div className="h-3 w-3/4 rounded skeleton" />
              <div className="h-6 w-12 rounded skeleton" />
            </div>
          ))}
        </div>

        {/* CTA banner */}
        <div className="rounded-[var(--radius-md)] border border-[var(--gold-soft)]/40 bg-[var(--surface)] p-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full skeleton shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded skeleton" />
              <div className="h-3 w-3/4 rounded skeleton" />
            </div>
            <div className="h-5 w-5 rounded skeleton shrink-0" />
          </div>
        </div>

        {/* My auctions grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="h-5 w-28 rounded skeleton" />
            <div className="h-3 w-20 rounded skeleton" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[4/5] rounded-2xl skeleton" />
                <div className="h-3 w-3/4 rounded skeleton" />
                <div className="h-3 w-1/2 rounded skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
