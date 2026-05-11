import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for /buyer/dashboard. Two layouts kept in sync with the
 * actual page: mobile linear flow + desktop hero + 4 big tiles + grid.
 */
export default function Loading() {
  return (
    <AppShell>
      <RouteLoading>
      {/* MOBILE skeleton */}
      <div className="lg:hidden max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded skeleton" />
          <div className="h-3 w-3/4 rounded skeleton" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2"
            >
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-7 w-12 rounded skeleton" />
            </div>
          ))}
        </div>

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

      {/* DESKTOP skeleton — mirrors the real desktop layout: 5xl hero
          + 4 big stat tiles + bigger suggestions grid. */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10 space-y-10">
        {/* Hero row */}
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded skeleton" />
            <div className="h-12 w-96 rounded skeleton" />
            <div className="h-4 w-72 rounded skeleton" />
          </div>
          <div className="h-12 w-36 rounded-full skeleton" />
        </div>

        {/* Big stat tiles */}
        <div className="grid grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 space-y-5"
            >
              <div className="h-12 w-12 rounded-xl skeleton" />
              <div className="h-12 w-20 rounded skeleton" />
              <div className="h-3.5 w-32 rounded skeleton" />
            </div>
          ))}
        </div>

        {/* Suggestions */}
        <div className="space-y-5">
          <div className="flex items-end justify-between">
            <div className="space-y-3">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-8 w-44 rounded skeleton" />
            </div>
            <div className="h-4 w-20 rounded skeleton" />
          </div>
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[4/5] rounded-2xl skeleton" />
                <div className="h-3.5 w-3/4 rounded skeleton" />
                <div className="h-3 w-1/2 rounded skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
      </RouteLoading>
    </AppShell>
  );
}
