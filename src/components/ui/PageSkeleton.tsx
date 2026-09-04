/**
 * Page-shaped loading states, so a `loading.tsx` is three lines instead of
 * forty.
 *
 * Why every route needs its own file: the App Router only commits a navigation
 * immediately when a loading boundary exists *inside the part of the tree that
 * is changing*. `[locale]/loading.tsx` is an ancestor of every page, so it
 * fires on the first load of the locale and never again — navigating between
 * two pages under it had no boundary at all, which is why a click sat there
 * doing nothing until the server had rendered the whole next page.
 *
 * These are deliberately rough. A skeleton is a promise about layout, not a
 * drawing of it: close enough that content lands where the grey was, cheap
 * enough that nobody maintains it.
 */

/** One shimmering block. `.skel` carries the shimmer (see globals.css). */
export function Bar({ w = "w-full", h = "h-3", className = "" }: {
  w?: string; h?: string; className?: string;
}) {
  return <div className={`skel ${h} ${w} rounded-full ${className}`} />;
}

/** Title, subtitle, and paragraphs — the static pages. */
export function ProseSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:py-14">
      <Bar w="w-2/3" h="h-8" className="lg:h-10" />
      <Bar w="w-1/2" h="h-3" className="mt-3" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="mt-8 space-y-2.5">
          <Bar w="w-40" h="h-4" />
          <Bar />
          <Bar w="w-11/12" />
          <Bar w="w-10/12" />
          <Bar w="w-2/3" />
        </div>
      ))}
    </main>
  );
}

/** A short intro then a grid of cards — pricing, help hubs. */
export function CardsSkeleton({ cards = 3, cols = "sm:grid-cols-3" }: {
  cards?: number; cols?: string;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:py-14">
      <Bar w="w-1/2" h="h-8" className="mx-auto lg:h-10" />
      <Bar w="w-2/3" h="h-3" className="mx-auto mt-3" />
      <div className={`mt-10 grid grid-cols-1 gap-4 ${cols}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5">
            <Bar w="w-24" h="h-2.5" />
            <Bar w="w-32" h="h-7" className="mt-4" />
            <div className="mt-5 space-y-2">
              <Bar />
              <Bar w="w-5/6" />
              <Bar w="w-4/6" />
            </div>
            <Bar h="h-10" className="mt-6 rounded-xl" />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Label + field, repeated — settings and contact forms. */
export function FormSkeleton({ fields = 5, wide = false }: {
  fields?: number; wide?: boolean;
}) {
  return (
    <main className={`mx-auto px-4 py-6 lg:py-10 ${wide ? "max-w-3xl" : "max-w-2xl"}`}>
      <Bar w="w-56" h="h-7" className="lg:h-9" />
      <Bar w="w-72" h="h-3" className="mt-2" />
      <div className="mt-6 space-y-5 rounded-2xl border border-border bg-surface p-4 lg:p-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Bar w="w-24" h="h-2.5" />
            <Bar h="h-12" className="mt-2 rounded-xl" />
          </div>
        ))}
        <Bar h="h-12" className="rounded-xl" />
      </div>
    </main>
  );
}

/** A grid of listing cards — favourites, saved searches. */
export function GridSkeleton({ items = 8 }: { items?: number }) {
  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 py-6 lg:px-6 lg:py-10">
      <Bar w="w-48" h="h-7" className="lg:h-9" />
      <Bar w="w-64" h="h-3" className="mt-2" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="skel aspect-[4/3]" />
            <div className="space-y-2 p-3 lg:p-4">
              <Bar w="w-1/3" h="h-2" />
              <Bar w="w-11/12" />
              <Bar w="w-1/2" h="h-4" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * The admin console's content area. The rail lives in admin/layout.tsx and
 * stays put, so this fills only the pane that is actually changing.
 */
export function ConsoleSkeleton({ rows = 8, tiles = 0 }: {
  rows?: number; tiles?: number;
}) {
  return (
    <div className="px-6 py-6">
      <Bar w="w-24" h="h-2.5" />
      <Bar w="w-56" h="h-7" className="mt-2" />

      {tiles > 0 && (
        <div className="mt-6 grid gap-px border-y border-border bg-border sm:grid-cols-3">
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="bg-background px-4 py-4">
              <Bar w="w-20" h="h-2.5" />
              <Bar w="w-12" h="h-6" className="mt-3" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 divide-y divide-border border-y border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-1 py-3">
            <Bar w="w-1.5" h="h-1.5" className="shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar w="w-64" h="h-3.5" />
              <Bar w="w-40" h="h-2.5" />
            </div>
            <Bar w="w-20" h="h-3" />
            <Bar w="w-16" h="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
