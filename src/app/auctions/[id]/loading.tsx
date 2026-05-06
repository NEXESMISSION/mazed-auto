import { AppShell } from "@/components/layout/AppShell";

/**
 * Loading skeleton for the auction detail screen — mirrors the actual
 * layout (full-bleed hero + two pills + CTA + stacked sections) so the
 * frame doesn't shift when content arrives.
 */
export default function Loading() {
  return (
    <AppShell noTopBar>
      {/* Hero */}
      <div className="h-[58vh] min-h-[440px] max-h-[560px] skeleton rounded-none" />

      <div className="px-4 pt-5 pb-4 space-y-5">
        {/* Description */}
        <div className="space-y-2">
          <div className="h-3 w-full rounded skeleton" />
          <div className="h-3 w-5/6 rounded skeleton" />
        </div>

        {/* Two pills */}
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[72px] rounded-2xl skeleton" />
          <div className="h-[72px] rounded-2xl skeleton" />
        </div>

        {/* Big CTA */}
        <div className="h-14 rounded-full skeleton" />

        {/* Specs grid */}
        <div className="space-y-3">
          <div className="h-2.5 w-20 rounded skeleton" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl skeleton" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
