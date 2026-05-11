import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Shapes } from "lucide-react";
import { AutoPagingScroller } from "./AutoPagingScroller";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { CmsCategory } from "@/lib/cms";

interface Props {
  categories: CmsCategory[];
  locale: string;
}

/**
 * Home rail that lets users jump straight to /auctions filtered by body
 * type. Tiles are admin-managed via /admin/cms/categories — slug must
 * match a VehicleCategory value or the link won't match any auctions.
 */
export function CategoryStrip({ categories, locale }: Props) {
  if (categories.length === 0) return null;
  const label = (c: CmsCategory) =>
    locale === "ar" ? c.nameAr ?? c.nameFr : c.nameFr;

  return (
    <section className="mt-7 lg:mt-14">
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">
          Parcourir par carrosserie
        </h2>
        <Link
          href="/auctions"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <DesktopRailHeader
        eyebrow="Catalogue"
        title="Parcourir par"
        accent="carrosserie"
        subtitle="Du citadin au pickup en un clic"
        IconLeft={Shapes}
        href="/auctions"
        ctaLabel="Toutes les catégories"
      />

      <div className="lg:hidden">
        <AutoPagingScroller intervalMs={5500}>
          <div className="flex gap-3 px-4 pb-1">
            {[...categories, ...categories].map((c, i) => (
              <Link
                key={`${c.slug}-${i}`}
                href={`/auctions?body=${encodeURIComponent(c.slug)}`}
                aria-hidden={i >= categories.length ? true : undefined}
                className="group relative w-[120px] h-[120px] shrink-0 snap-center overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold-soft)]/50 transition-shadow"
              >
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt={label(c)}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                    draggable={false}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
                  <div className="text-[13px] font-extrabold leading-tight text-white">
                    {label(c)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </AutoPagingScroller>
      </div>

      <div className="hidden lg:grid px-8 grid-cols-4 gap-5">
        {categories.slice(0, 8).map((c) => (
          <Link
            key={c.slug}
            href={`/auctions?body=${encodeURIComponent(c.slug)}`}
            className="group relative aspect-[5/4] overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold)] transition-all"
          >
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.imageUrl}
                alt={label(c)}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                draggable={false}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
            <span className="pointer-events-none absolute top-3 end-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/10 text-white opacity-0 group-hover:opacity-100 group-hover:bg-[var(--gold)] group-hover:text-black transition-all">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <div className="text-base font-extrabold leading-tight text-white">
                {label(c)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
