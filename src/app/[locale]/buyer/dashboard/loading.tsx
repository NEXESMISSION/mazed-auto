import { AppShell } from "@/components/layout/AppShell";

/**
 * Skeleton for /buyer/dashboard — title + subtitle, 4-stat grid, then a
 * "recommended" section header + 2-col card grid.
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        {/* Title block */}
        <div className="space-y-2">
          <div className="h-7 w-40 rounded skeleton" />
          <div className="h-3 w-3/4 rounded skeleton" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-7 w-12 rounded skeleton" />
            </div>
          ))}
        </div>

        {/* Recommended section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-28 rounded skeleton" />
            <div className="h-3 w-24 rounded skeleton" />
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
