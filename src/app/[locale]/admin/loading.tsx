import { AdminShell } from "@/components/layout/AdminShell";

/**
 * Generic admin segment skeleton. Covers every /admin/* route that
 * doesn't ship its own loading.tsx so admins always see structure
 * instead of a blank page during the SSR fetch. Mirrors the typical
 * shape: page header (eyebrow + title + actions) + a grid of cards
 * + a list region. Page-specific loaders can override per-route.
 */
export default function AdminLoading() {
  return (
    <AdminShell>
      <div className="px-4 md:px-8 py-5 md:py-8 space-y-6">
        {/* Header row — eyebrow, title, optional action */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="h-3 w-32 rounded skeleton" />
            <div className="h-7 w-56 max-w-full rounded skeleton" />
          </div>
          <div className="h-10 w-28 rounded-full skeleton shrink-0" />
        </div>

        {/* KPI tiles — 2 on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3"
            >
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-7 w-16 rounded skeleton" />
              <div className="h-2 w-32 rounded skeleton" />
            </div>
          ))}
        </div>

        {/* List/table region */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-full skeleton shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 w-1/3 rounded skeleton" />
                <div className="h-2.5 w-2/3 rounded skeleton" />
              </div>
              <div className="h-7 w-20 rounded-full skeleton shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
