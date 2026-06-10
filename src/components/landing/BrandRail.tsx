import { Link } from "@/i18n/navigation";
import { Car } from "lucide-react";

/**
 * "Parcourir par marque" — a horizontal rail of the makes present in the
 * live catalogue (the old home's BrandSlider, text+icon chips instead of
 * logo tiles). Each chip deep-links into Explore filtered by that make.
 */
export function BrandRail({
  makes,
  title,
}: {
  makes: { name: string; count: number }[];
  title: string;
}) {
  if (!makes.length) return null;
  return (
    <section className="mt-10 px-4">
      <h3 className="text-[15px] font-bold leading-tight">{title}</h3>
      <div className="snap-rail hide-scrollbar -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1">
        {makes.map((m) => (
          <Link
            key={m.name}
            href={`/properties?q=${encodeURIComponent(m.name)}` as `/properties`}
            className="tap-target group inline-flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl bg-surface-2 px-5 py-3.5 ring-1 ring-border transition active:scale-[0.97] hover:ring-gold-soft/50"
          >
            <span className="batta-monogram size-9 text-gold">
              <Car className="size-4" strokeWidth={2} />
            </span>
            <span className="whitespace-nowrap text-[12px] font-bold text-foreground">{m.name}</span>
            <span className="text-[10px] text-muted">
              {m.count} lot{m.count > 1 ? "s" : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
