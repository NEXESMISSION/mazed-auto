import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for /sellers — mirrors the directory layout: ScreenHeader
 * (title only, no back), pill search bar, count line, then a vertical
 * list of seller rows.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
      {/* ScreenHeader — title only */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <span className="h-10 w-10 shrink-0" />
        <div className="flex-1">
          <div className="h-4 w-24 rounded skeleton" />
        </div>
      </div>

      <div className="pt-2">
        {/* Pill search */}
        <div className="px-4">
          <div className="h-12 rounded-full skeleton" />
        </div>

        {/* Count line */}
        <div className="px-4 mt-4 flex items-center justify-between">
          <div className="h-4 w-32 rounded skeleton" />
          <div className="h-3 w-16 rounded skeleton" />
        </div>

        {/* Seller rows */}
        <ul className="mt-3 px-4 pb-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"
            >
              <div className="h-10 w-10 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-1/2 rounded skeleton" />
                <div className="h-3 w-3/4 rounded skeleton" />
              </div>
              <div className="h-4 w-4 rounded skeleton shrink-0" />
            </li>
          ))}
        </ul>
      </div>
      </RouteLoading>
    </AppShell>
  );
}
