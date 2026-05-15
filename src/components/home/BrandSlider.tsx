import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Car } from "lucide-react";
import { thumb } from "@/lib/imageUrl";
import { DesktopRailHeader } from "./DesktopRailHeader";
import type { Auction } from "@/lib/types";
import type { CmsBrand } from "@/lib/cms";

interface Tile {
  name: string;
  image: string;
  count: number;
}

interface Props {
  /** Pool of live auctions — used to count cars per brand. */
  pool: Auction[];
  /** Admin-curated brand list. When non-empty, drives the grid entirely
   *  (image + label + order). When empty, falls back to deriving tiles
   *  from the auction pool so a fresh DB still shows something useful. */
  brands?: CmsBrand[];
}

/**
 * BrandGrid (legacy name BrandSlider) — full grid of all marques, 3
 * tiles per row on mobile, scaling up on larger screens. Tiles use a
 * white background so dark-on-transparent logos (BMW, Mercedes, etc.)
 * render with proper contrast on our dark theme.
 *
 * Previously this section was a horizontal auto-paging slider; the
 * grid surfaces every brand at once so users don't miss anything.
 */
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
          href="/auctions?view=classic"
          className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-[var(--gold)] inline-flex items-center gap-0.5 transition-colors"
        >
          Voir tout
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Desktop header — "see more" links land on the classic browse
          hub so the user gets the full marque directory, not the
          filter-bar list. */}
      <DesktopRailHeader
        eyebrow="Catalogue"
        title="Parcourir par"
        accent="marque"
        subtitle="Toutes les marques disponibles — cliquez pour filtrer"
        IconLeft={Car}
        href="/auctions?view=classic"
        ctaLabel="Toutes les marques"
      />

      {/* Unified grid — 3-per-row on mobile (per spec), scaling up on
          larger screens for desktop density. */}
      <div className="px-4 lg:px-8 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 lg:gap-4">
        {tiles.map((t) => (
          <Link
            key={t.name}
            href={`/auctions?brand=${encodeURIComponent(t.name)}`}
            aria-label={`Voir les voitures ${t.name}`}
            className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--border)] bg-white hover:ring-[var(--gold)] hover:shadow-[0_4px_20px_-4px_rgba(212,175,55,0.35)] transition-all"
          >
            {/* Logo fills tile. Logo alone — no label overlay — so the
                brand mark is the entire visual; aria-label on the <Link>
                keeps screen-reader navigation working. */}
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(t.image, { width: 320, quality: 85, format: "origin" })}
                alt={t.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain p-3 lg:p-4 transition-transform duration-300 group-hover:scale-105"
                draggable={false}
              />
            ) : (
              /* No-logo fallback — initials in gold on white. */
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center text-[28px] lg:text-[40px] font-black tracking-tight text-[var(--gold)] opacity-70"
              >
                {t.name.slice(0, 2).toUpperCase()}
              </span>
            )}
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
    // Show every active brand with a logo. Brands without a logo are
    // skipped so we don't render initials-only tiles next to real logos
    // — upload a logo via /admin/cms/brands to bring a brand back in.
    return brands
      .filter((b) => Boolean(b.logoUrl))
      .map((b) => ({
        name: b.displayName,
        image: b.logoUrl as string,
        count: countsByMake.get(b.displayName) ?? 0,
      }));
  }

  return Array.from(countsByMake.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      image: firstPhotoByMake.get(name) ?? "",
      count,
    }));
}
