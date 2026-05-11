import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for /buyer/bids — ScreenHeader (no back), tab strip
 * (3 underlined tabs), then a vertical list of bid cards (image left +
 * info right with status pill).
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
      {/* ScreenHeader */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <span className="h-10 w-10 shrink-0" />
        <div className="flex-1">
          <div className="h-4 w-28 rounded skeleton" />
        </div>
      </div>

      <div className="px-4 pb-8 space-y-4">
        {/* Tabs strip */}
        <div className="flex gap-2 border-b border-[var(--border)] pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-20 rounded skeleton" />
          ))}
        </div>

        {/* Bid cards */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
            >
              <div className="flex gap-3 p-3">
                <div className="h-20 w-28 rounded-[var(--radius-sm)] skeleton shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-4 w-2/3 rounded skeleton" />
                    <div className="h-5 w-16 rounded-full skeleton shrink-0" />
                  </div>
                  <div className="h-3 w-1/2 rounded skeleton" />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <div className="h-2.5 w-12 rounded skeleton" />
                      <div className="h-3.5 w-3/4 rounded skeleton" />
                    </div>
                    <div className="space-y-1">
                      <div className="h-2.5 w-16 rounded skeleton" />
                      <div className="h-3.5 w-3/4 rounded skeleton" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </RouteLoading>
    </AppShell>
  );
}
