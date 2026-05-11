import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Car } from "lucide-react";
import { thumb } from "@/lib/imageUrl";
import { AutoPagingScroller } from "./AutoPagingScroller";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";

const TILE_LIMIT = 10;

interface Props {
  /** Pool of auctions to derive brand tiles from. Caller passes the home
   *  page's full active-auction fetch so we don't issue another query. */
  pool: Auction[];
}

export function BrandSlider({ pool }: Props) {
  const byBrand = new Map<string, { image: string; count: number }>();
  for (const a of pool) {
    const key = a.vehicle.make;
    if (!key) continue;
    const cur = byBrand.get(key);
    if (cur) {
      cur.count += 1;
    } else {
      byBrand.set(key, {
        image: a.vehicle.imageUrls[0] ?? "",
        count: 1,
      });
    }
  }
  const brands = Array.from(byBrand.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TILE_LIMIT);
  if (brands.length === 0) return null;

  return (
    <section className="mt-7 lg:mt-14">
      {/* Mobile header */}
      <div className="lg:hidden px-4 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-foreground">
          Parcourir par marque
        </h2>
        <Link
          href="/auctions"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Desktop header */}
      <DesktopRailHeader
        eyebrow="Catalogue"
        title="Parcourir par"
        accent="marque"
        subtitle="Trouvez votre constructeur préféré en un clic"
        IconLeft={Car}
        href="/auctions"
        ctaLabel="Toutes les marques"
      />

      {/* Mobile auto-paging scroller — keep tiles compact for phone */}
      <div className="lg:hidden">
        <AutoPagingScroller intervalMs={5500}>
          <div className="flex gap-3 px-4 pb-1">
            {[...brands, ...brands].map(([name, b], i) => (
              <Link
                key={`${name}-${i}`}
                href={`/auctions?brand=${encodeURIComponent(name)}`}
                aria-hidden={i >= brands.length ? true : undefined}
                className="group relative w-[120px] h-[120px] shrink-0 snap-center overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold-soft)]/50 transition-shadow"
              >
                {b.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb(b.image, { width: 240, quality: 65 })}
                    alt={name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                    draggable={false}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
                  <div className="text-[13px] font-extrabold leading-tight text-white">
                    {name}
                  </div>
                  <div className="text-[10px] tabular-nums text-white/70 mt-0.5">
                    {b.count} {b.count === 1 ? "voiture" : "voitures"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </AutoPagingScroller>
      </div>

      {/* Desktop grid — 5-col, bigger square tiles, hover lifts the photo */}
      <div className="hidden lg:grid px-8 grid-cols-5 gap-5">
        {brands.slice(0, 10).map(([name, b]) => (
          <Link
            key={name}
            href={`/auctions?brand=${encodeURIComponent(name)}`}
            className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold)] transition-all"
          >
            {b.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(b.image, { width: 480, quality: 70 })}
                alt={name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                draggable={false}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
            {/* Hover hint */}
            <span className="pointer-events-none absolute top-3 end-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/10 text-white opacity-0 group-hover:opacity-100 group-hover:bg-[var(--gold)] group-hover:text-black transition-all">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <div className="text-base font-extrabold leading-tight text-white">
                {name}
              </div>
              <div className="text-[11px] tabular-nums text-white/70 mt-0.5">
                {b.count} {b.count === 1 ? "voiture" : "voitures"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
