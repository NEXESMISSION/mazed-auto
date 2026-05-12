import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Car } from "lucide-react";
import { thumb } from "@/lib/imageUrl";
import { AutoPagingScroller } from "./AutoPagingScroller";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";
import type { CmsBrand } from "@/lib/cms";

const TILE_LIMIT = 10;

interface Tile {
  name: string;
  image: string;
  count: number;
}

interface Props {
  /** Pool of live auctions — used to count cars per brand. */
  pool: Auction[];
  /** Admin-curated brand list. When non-empty, drives the slider entirely
   *  (image + label + order). When empty, the slider falls back to
   *  deriving tiles from the auction pool so a fresh DB still shows
   *  something useful. */
  brands?: CmsBrand[];
}

export function BrandSlider({ pool, brands }: Props) {
  const tiles = buildTiles(pool, brands ?? []);
  if (tiles.length === 0) return null;

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
            {[...tiles, ...tiles].map((t, i) => (
              <Link
                key={`${t.name}-${i}`}
                href={`/auctions?brand=${encodeURIComponent(t.name)}`}
                aria-hidden={i >= tiles.length ? true : undefined}
                className="group relative w-[120px] h-[120px] shrink-0 snap-center overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold-soft)]/50 transition-shadow"
              >
                {t.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb(t.image, { width: 240, quality: 65 })}
                    alt={t.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                    draggable={false}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
                  <div className="text-[13px] font-extrabold leading-tight text-white">
                    {t.name}
                  </div>
                  {t.count > 0 && (
                    <div className="text-[10px] tabular-nums text-white/70 mt-0.5">
                      {t.count} {t.count === 1 ? "voiture" : "voitures"}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </AutoPagingScroller>
      </div>

      {/* Desktop grid — 5-col, bigger square tiles, hover lifts the photo */}
      <div className="hidden lg:grid px-8 grid-cols-5 gap-5">
        {tiles.slice(0, 10).map((t) => (
          <Link
            key={t.name}
            href={`/auctions?brand=${encodeURIComponent(t.name)}`}
            className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:ring-[var(--gold)] transition-all"
          >
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(t.image, { width: 480, quality: 70 })}
                alt={t.name}
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
                {t.name}
              </div>
              {t.count > 0 && (
                <div className="text-[11px] tabular-nums text-white/70 mt-0.5">
                  {t.count} {t.count === 1 ? "voiture" : "voitures"}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function buildTiles(pool: Auction[], brands: CmsBrand[]): Tile[] {
  const countsByMake = new Map<string, number>();
  const firstPhotoByMake = new Map<string, string>();
  for (const a of pool) {
    const k = a.vehicle.make;
    if (!k) continue;
    countsByMake.set(k, (countsByMake.get(k) ?? 0) + 1);
    if (!firstPhotoByMake.has(k) && a.vehicle.imageUrls[0]) {
      firstPhotoByMake.set(k, a.vehicle.imageUrls[0]);
    }
  }

  if (brands.length > 0) {
    return brands
      .slice(0, TILE_LIMIT)
      .map((b) => ({
        name: b.displayName,
        image: b.logoUrl || firstPhotoByMake.get(b.displayName) || "",
        count: countsByMake.get(b.displayName) ?? 0,
      }));
  }

  return Array.from(countsByMake.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TILE_LIMIT)
    .map(([name, count]) => ({
      name,
      image: firstPhotoByMake.get(name) ?? "",
      count,
    }));
}
