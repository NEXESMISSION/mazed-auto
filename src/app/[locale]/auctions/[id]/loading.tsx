import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Loading skeleton for the auction detail screen — mirrors the actual
 * layout (mobile linear / desktop 2-col with sticky bid card) so the
 * frame doesn't shift when content arrives.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
      {/* Hero — same on both viewports */}
      <div className="h-[58vh] min-h-[440px] max-h-[560px] skeleton rounded-none" />

      {/* MOBILE skeleton */}
      <div className="lg:hidden px-4 pt-5 pb-4 space-y-5">
        <div className="space-y-2">
          <div className="h-3 w-full rounded skeleton" />
          <div className="h-3 w-5/6 rounded skeleton" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[72px] rounded-2xl skeleton" />
          <div className="h-[72px] rounded-2xl skeleton" />
        </div>
        <div className="h-14 rounded-full skeleton" />
        <div className="space-y-3">
          <div className="h-2.5 w-20 rounded skeleton" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl skeleton" />
            ))}
          </div>
        </div>
      </div>

      {/* DESKTOP skeleton — 2-col with sticky bid card on the right */}
      <div className="hidden lg:block max-w-[var(--max-w-wide)] mx-auto px-8 py-10">
        <div className="grid grid-cols-[1fr_420px] gap-10 items-start">
          {/* Main column */}
          <div className="space-y-10 min-w-0">
            <div className="space-y-3">
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-3.5 w-full rounded skeleton" />
              <div className="h-3.5 w-5/6 rounded skeleton" />
              <div className="h-3.5 w-3/4 rounded skeleton" />
            </div>
            <div className="space-y-4">
              <div className="h-3 w-32 rounded skeleton" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl skeleton" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-3 w-32 rounded skeleton" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 w-24 rounded-full skeleton" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-32 rounded-2xl skeleton" />
            </div>
          </div>

          {/* Sticky bid panel */}
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-3 w-16 rounded skeleton" />
            </div>
            <div className="space-y-3">
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-12 w-44 rounded skeleton" />
              <div className="h-3 w-32 rounded skeleton" />
            </div>
            <div className="-mx-6 px-6 py-4 bg-[var(--surface-2)] border-y border-[var(--border)] space-y-2">
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-5 w-32 rounded skeleton" />
            </div>
            <div className="space-y-3">
              <div className="h-14 rounded-full skeleton" />
              <div className="h-12 rounded-full skeleton" />
              <div className="h-12 rounded-xl skeleton" />
            </div>
          </div>
        </div>
      </div>
      </RouteLoading>
    </AppShell>
  );
}
