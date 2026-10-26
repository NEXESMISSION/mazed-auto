/**
 * Catalogue skeleton — the rail and the card grid in the proportions the real
 * page uses, so arriving content does not reflow the page under the reader.
 *
 * This is the FIRST load of /annonces. Changing a filter on a page already open
 * is a different state with a different treatment (the results dim and their own
 * skeleton fades in — see `data-catalog-skeleton` in globals.css), because there
 * the previous results are still worth looking at while the next ones arrive.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--max-w-wide)] px-4 py-5 lg:px-6 lg:py-8">
      <header className="lg:mb-6">
        <div className="skel h-7 w-44 rounded-full lg:h-9" />
        <div className="skel mt-2 h-3 w-72 max-w-full rounded-full" />
      </header>

      <div className="mt-5 lg:mt-0 lg:grid lg:grid-cols-[272px_1fr] lg:gap-7">
        {/* Filter rail — desktop only, matching CatalogSidebar */}
        <aside className="hidden lg:block">
          <div className="space-y-5 rounded-2xl border border-border bg-surface p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="skel h-2.5 w-24 rounded-full" />
                <div className="skel mt-2 h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Search + sort row */}
          <div className="flex gap-2">
            <div className="skel h-12 flex-1 rounded-xl" />
            <div className="skel h-12 w-28 rounded-xl lg:hidden" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="skel h-3 w-24 rounded-full" />
            <div className="skel h-8 w-36 rounded-lg" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-5 lg:grid-cols-2 lg:gap-5 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="skel aspect-[4/3]" />
                <div className="space-y-2 p-3 lg:p-4">
                  <div className="skel h-2 w-1/3 rounded-full" />
                  <div className="skel h-3 w-11/12 rounded-full" />
                  <div className="skel h-2.5 w-2/3 rounded-full" />
                  <div className="skel h-4 w-1/2 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
