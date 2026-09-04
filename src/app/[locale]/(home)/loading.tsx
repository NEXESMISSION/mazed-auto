/**
 * Home loading state.
 *
 * It used to draw the v2 page — a split hero of copy and banner, a live ticker
 * tape, an "ending soon" urgency strip — none of which has existed since the
 * auctions came out. So the placeholder and the page it stood in for had
 * different shapes, and the swap was a jolt rather than a fill-in.
 *
 * WHY IT LOOKED LIKE NOTHING AT ALL. On desktop it rendered
 * `DesktopLoadingSpinner`: an opaque full-viewport sheet in `--background`
 * with a 36px ring on it, deliberately covering the skeletons so a wide screen
 * got "one clean circle" instead of a wall of shimmer. The ring is
 * `--border` (#2a2a2a) with a gold arc, on #0a0a0a, in the middle of a 1900px
 * window — so what a desktop actually got, waiting on a page that takes a
 * second or two, was a black screen. The report was "it stuck".
 *
 * So: no sheet, and the real layout underneath. It draws what is now there —
 * the strip, the headline, the featured spread with its three runners, and the
 * two drifting rows — at the sizes those things really are.
 *
 * `.skel`, not `.batta-skeleton`: the latter is switched off above 1024px by
 * the same rule that assumed the spinner would be covering it, and its
 * #141414-on-#1c1c1c step is invisible on a near-black page anyway. `.skel`
 * carries a travelling highlight that can actually be seen, and it stops under
 * `prefers-reduced-motion`.
 */

export default function HomeLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      {/* ── Mobile: cover carousel, then the rails ── */}
      <div className="px-4 pt-3 lg:hidden">
        <div className="skel aspect-[16/10] w-full rounded-3xl" />
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skel h-1.5 w-6 rounded-full" />
          ))}
        </div>
      </div>

      {/* ── Desktop: the editorial spread, at the size it really is ── */}
      <div className="mx-auto hidden max-w-[var(--max-w-wide)] px-8 pb-14 pt-10 lg:block">
        {/* Top strip */}
        <div className="mb-9 flex items-center justify-between gap-4">
          <div className="skel h-9 w-72 rounded-full" />
          <div className="skel h-11 w-52 rounded-full" />
        </div>

        {/* Eyebrow, headline, standfirst */}
        <div className="mb-8">
          <div className="skel h-3 w-56 rounded-full" />
          <div className="mt-4 space-y-3">
            <div className="skel h-11 w-[34rem] max-w-full rounded-lg" />
            <div className="skel h-11 w-[22rem] max-w-full rounded-lg" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="skel h-4 w-[30rem] max-w-full rounded" />
            <div className="skel h-4 w-[24rem] max-w-full rounded" />
          </div>
        </div>

        {/* Featured + the three runners beside it */}
        <div className="grid grid-cols-[1.7fr_1fr] gap-6 xl:gap-7">
          <div className="skel aspect-[16/10] w-full rounded-[28px]" />
          <div className="grid grid-rows-3 gap-5 xl:gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skel min-h-[132px] w-full rounded-[22px]" />
            ))}
          </div>
        </div>

        {/* The two drifting rows. Static here — a placeholder that scrolls
            would be pretending to be the thing it is standing in for. */}
        <div className="-mx-8 mt-12 space-y-3 overflow-hidden">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-3 px-8">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-[248px] shrink-0">
                  <div className="skel aspect-[4/3] w-full rounded-2xl" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Both: the rails under the cover ── */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 px-4 lg:px-6">
          <div className="space-y-2">
            <div className="skel h-2.5 w-24 rounded-full" />
            <div className="skel h-5 w-40 rounded" />
          </div>
          <div className="skel h-4 w-20 rounded-full" />
        </div>

        <div className="mt-3 flex gap-3 overflow-hidden px-4 lg:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <RailCard key={i} />
          ))}
        </div>
        <div className="mt-3 hidden gap-5 px-6 lg:grid lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <RailCard key={i} />
          ))}
        </div>
      </section>

      <section className="mt-8 pb-10">
        <div className="flex items-end justify-between gap-3 px-4 lg:px-6">
          <div className="space-y-2">
            <div className="skel h-2.5 w-20 rounded-full" />
            <div className="skel h-5 w-36 rounded" />
          </div>
          <div className="skel h-4 w-20 rounded-full" />
        </div>
        <div className="mt-3 flex gap-3 overflow-hidden px-4 lg:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <RailCard key={i} />
          ))}
        </div>
        <div className="mt-3 hidden gap-5 px-6 lg:grid lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <RailCard key={i} />
          ))}
        </div>
      </section>

      <span className="sr-only">Chargement…</span>
    </div>
  );
}

function RailCard() {
  return (
    <div className="w-[210px] shrink-0 lg:w-auto">
      <div className="skel aspect-[4/3] w-full rounded-2xl" />
      <div className="space-y-1.5 px-1 pt-2.5">
        <div className="skel h-3.5 w-3/4 rounded" />
        <div className="skel h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
