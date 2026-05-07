import { AppShell } from "@/components/layout/AppShell";

/**
 * Skeleton for /notifications — slim back row, header (title + read-all
 * action), filter pill row, then a vertical list of notification rows
 * with a leading icon tile.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      {/* Slim back row */}
      <div className="px-4 pt-4 pb-1">
        <div className="h-10 w-10 rounded-full skeleton" />
      </div>

      <div className="px-4 pb-8 space-y-4">
        {/* Title row + read-all button */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 rounded skeleton" />
          <div className="h-8 w-24 rounded skeleton" />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-full skeleton" />
          <div className="h-9 w-32 rounded-full skeleton" />
        </div>

        {/* Notification rows */}
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3"
            >
              <div className="h-9 w-9 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded skeleton" />
                <div className="h-3 w-full rounded skeleton" />
                <div className="h-2.5 w-16 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
