import { AppShell } from "@/components/layout/AppShell";

/**
 * Generic top-level skeleton — mirrors the home composition (avatar row +
 * tagline + horizontal rail + sellers list) so the frame doesn't shift when
 * the route resolves. Used by Next.js while a route's server component
 * resolves on navigation.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <div className="px-4 pt-6">
        {/* Identity row */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full skeleton shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-1/2 rounded skeleton" />
            <div className="h-2.5 w-2/3 rounded skeleton" />
          </div>
          <div className="h-10 w-10 rounded-full skeleton shrink-0" />
        </div>

        {/* Tagline */}
        <div className="mt-7 space-y-2">
          <div className="h-7 w-3/4 rounded skeleton" />
          <div className="h-7 w-2/3 rounded skeleton" />
        </div>
      </div>

      {/* Recommended rail */}
      <div className="mt-6">
        <div className="px-4 flex items-center justify-between mb-3">
          <div className="h-4 w-16 rounded skeleton" />
          <div className="h-3 w-12 rounded skeleton" />
        </div>
        <div className="flex gap-3 px-4 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[230px] shrink-0 space-y-2">
              <div className="aspect-[4/5] rounded-2xl skeleton" />
              <div className="h-3 w-3/4 rounded skeleton" />
              <div className="h-3 w-1/2 rounded skeleton" />
            </div>
          ))}
        </div>
      </div>

      {/* Sellers card */}
      <div className="mt-7 px-4">
        <div className="h-4 w-28 rounded skeleton mb-3" />
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-1/2 rounded skeleton" />
                <div className="h-2.5 w-1/3 rounded skeleton" />
              </div>
              <div className="h-8 w-14 rounded-full skeleton shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
