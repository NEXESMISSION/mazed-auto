import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for the search/results screen. Matches the real
 * AuctionsBrowser layout so the frame doesn't shift on hydration:
 *   toolbar (search + sort + filter + view-toggle)
 *   active-filter chips row
 *   "X enchères" results heading
 *   2-col mobile / 3–5-col desktop grid
 *
 * Previously the skeleton showed a sellers list that no longer exists
 * in the modern browser, and skipped the toolbar entirely — which made
 * hydration feel jarring because real chrome popped in over a fake grid.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
        <div className="pt-5 lg:pt-10">
          {/* Desktop magazine title strip (lg+ only — mirror of the
              real page heading + view-mode toggle row). */}
          <div className="hidden lg:flex items-end justify-between gap-6 px-8 mb-8">
            <div className="space-y-2.5">
              <div className="h-3 w-32 rounded skeleton" />
              <div className="h-12 w-72 rounded skeleton" />
              <div className="h-4 w-96 rounded skeleton" />
            </div>
            <div className="h-10 w-32 rounded-full skeleton" />
          </div>

          {/* Sticky toolbar row — search (full-width on mobile),
              sort pill, filter pill, view toggle. */}
          <div className="px-4 lg:px-8 flex items-center gap-2 lg:gap-3">
            <div className="h-11 lg:h-12 flex-1 rounded-full skeleton" />
            <div className="hidden lg:block h-12 w-28 rounded-full skeleton" />
            <div className="h-11 w-11 lg:w-28 rounded-full skeleton" />
            <div className="h-11 w-11 lg:hidden rounded-full skeleton" />
          </div>

          {/* Active-filter chips strip — narrower, 3 pills. */}
          <div className="px-4 lg:px-8 mt-3 flex items-center gap-2">
            <div className="h-7 w-20 rounded-full skeleton" />
            <div className="h-7 w-24 rounded-full skeleton" />
            <div className="h-7 w-16 rounded-full skeleton" />
          </div>

          {/* Results heading + sort label. */}
          <div className="px-4 lg:px-8 mt-6 flex items-center justify-between">
            <div className="h-5 w-32 rounded skeleton" />
            <div className="hidden lg:block h-4 w-40 rounded skeleton" />
          </div>

          {/* Products grid — column count tracks the real page
              (sm:2 / md:3 / lg:4 / xl:5). 12 cards is enough to fill
              the viewport on every breakpoint. */}
          <div className="mt-4 lg:mt-5 px-4 lg:max-w-[var(--max-w-wide)] lg:mx-auto lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-3 lg:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-[4/5] rounded-2xl skeleton" />
                  <div className="h-3 w-3/4 rounded skeleton" />
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
