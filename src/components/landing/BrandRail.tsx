import { Link } from "@/i18n/navigation";
import { CAR_BRANDS, brandCounts } from "@/lib/brands";

/**
 * "Parcourir par marque" — the full brand wall. A responsive grid of every
 * make's logo on a white tile (white bg so dark-on-transparent marks like
 * BMW / Mercedes / Audi keep contrast on the dark theme). Each tile deep-links
 * into Explore filtered by that make; tiles with live lots show a gold count
 * badge. Logos are static assets in /public/marques — see {@link CAR_BRANDS}.
 */
export function BrandRail({
  makes,
  title,
}: {
  makes: { name: string; count: number }[];
  title: string;
}) {
  const counts = brandCounts(makes);

  return (
    <section className="mt-10 px-4 lg:px-8">
      <h3 className="text-[15px] font-bold leading-tight lg:text-[19px] lg:font-extrabold lg:tracking-tight">
        {title}
      </h3>

      <div className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-9 lg:gap-3 xl:grid-cols-10">
        {CAR_BRANDS.map((brand) => {
          const count = counts.get(brand.name) ?? 0;
          return (
            <Link
              key={brand.name}
              href={`/properties?q=${encodeURIComponent(brand.query)}` as `/properties`}
              aria-label={
                count > 0
                  ? `Voir les ${count} voiture${count > 1 ? "s" : ""} ${brand.name}`
                  : `Voir les voitures ${brand.name}`
              }
              className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border transition active:scale-[0.97] hover:shadow-[0_4px_20px_-4px_rgba(212,175,55,0.35)] hover:ring-gold-soft/60"
            >
              {/* Logo IS the tile — alt + aria-label carry the name for a11y.
                  eslint-disable: static /public asset, plain <img> keeps it
                  out of the Next image pipeline (56 tiny PNGs, lazy-loaded). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brand.logo}
                alt={brand.name}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-contain p-2.5 transition-transform duration-300 group-hover:scale-105 lg:p-3"
              />
              {count > 0 && (
                <span className="absolute right-1 top-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-black shadow-sm">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
