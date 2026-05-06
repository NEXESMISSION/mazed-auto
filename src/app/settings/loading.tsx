import { AppShell } from "@/components/layout/AppShell";

/**
 * Skeleton for /settings — ScreenHeader + 4-5 grouped list cards each
 * with a section label and several rows.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      {/* ScreenHeader */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full skeleton shrink-0" />
        <div className="flex-1">
          <div className="h-4 w-24 rounded skeleton" />
        </div>
      </div>

      <div className="px-4 pb-8 space-y-5">
        {Array.from({ length: 4 }).map((_, gi) => (
          <div key={gi}>
            <div className="h-2 w-24 rounded skeleton mb-2 ml-1" />
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {Array.from({ length: gi === 1 ? 1 : 3 }).map((_, ri) => (
                <div key={ri} className="flex items-center gap-3 p-4">
                  <div className="h-4 w-4 rounded skeleton shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3.5 w-1/2 rounded skeleton" />
                    <div className="h-2.5 w-3/4 rounded skeleton" />
                  </div>
                  <div className="h-4 w-4 rounded skeleton shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
