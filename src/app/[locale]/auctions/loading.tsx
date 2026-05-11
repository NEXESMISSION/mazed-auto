import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for the search/results screen — pill search bar, "Results"
 * heading, sellers list, then the products grid. Matches the layout in
 * AuctionsBrowser so the frame doesn't shift on hydration.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
      <div className="pt-5">
        {/* Pill search */}
        <div className="px-4">
          <div className="h-12 rounded-full skeleton" />
        </div>

        {/* Results headline */}
        <div className="px-4 mt-6">
          <div className="h-7 w-24 rounded skeleton" />
        </div>

        {/* Sellers section */}
        <div className="mt-5 px-4 space-y-3">
          <div className="h-4 w-20 rounded skeleton" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded skeleton" />
                <div className="h-3 w-1/3 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>

        {/* Products grid — column count tracks the real page (md:3 / lg:4 / xl:5). */}
        <div className="mt-7 px-4 lg:max-w-[var(--max-w-wide)] lg:mx-auto lg:px-6">
          <div className="h-4 w-20 rounded skeleton mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
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
