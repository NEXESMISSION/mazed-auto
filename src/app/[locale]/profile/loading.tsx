import { AppShell } from "@/components/layout/AppShell";
import { RouteLoading } from "@/components/layout/RouteLoading";

/**
 * Skeleton for /profile — mirrors the actual page composition: header
 * with title + settings cog, identity card (avatar + name + email + role
 * pill), KYC nudge slot, three menu cards. Matches the layout in
 * `app/profile/page.tsx` so the frame doesn't shift on hydration.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      <RouteLoading>
      {/* ScreenHeader — title + trailing settings button */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <span className="h-10 w-10 shrink-0" />
        <div className="flex-1">
          <div className="h-4 w-24 rounded skeleton" />
        </div>
        <div className="h-10 w-10 rounded-full skeleton shrink-0" />
      </div>

      <div className="px-4 pb-8 space-y-5">
        {/* Identity card */}
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full skeleton shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded skeleton" />
            <div className="h-3 w-1/2 rounded skeleton" />
            <div className="h-4 w-16 rounded-full skeleton" />
          </div>
        </div>

        {/* KYC nudge */}
        <div className="rounded-2xl bg-[var(--gold-faint)] border border-[var(--gold)]/20 p-3.5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full skeleton shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded skeleton" />
            <div className="h-2.5 w-1/2 rounded skeleton" />
          </div>
        </div>

        {/* Three menu cards: section label + 3-4 rows each */}
        {Array.from({ length: 3 }).map((_, ci) => (
          <div key={ci}>
            <div className="h-2 w-20 rounded skeleton mb-2 ms-1" />
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
              {Array.from({ length: ci === 1 ? 3 : 4 }).map((_, ri) => (
                <div key={ri} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="h-8 w-8 rounded-lg skeleton shrink-0" />
                  <div className="flex-1 h-3.5 w-1/2 rounded skeleton" />
                  <div className="h-4 w-4 rounded skeleton shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Sign out button slot */}
        <div className="pt-1">
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] h-12" />
        </div>
      </div>
      </RouteLoading>
    </AppShell>
  );
}
