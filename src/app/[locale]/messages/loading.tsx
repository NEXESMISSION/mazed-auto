import { AppShell } from "@/components/layout/AppShell";

/**
 * Skeleton for /messages — title row, then a single divided card
 * containing conversation rows (avatar + name/preview + timestamp).
 */
export default function Loading() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-4">
        <div className="h-7 w-32 rounded skeleton" />

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-3.5 w-1/2 rounded skeleton" />
                  <div className="h-2.5 w-10 rounded skeleton shrink-0" />
                </div>
                <div className="h-3 w-3/4 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
