import { Gavel, Trophy, Car, MapPin } from "lucide-react";

/**
 * Compact platform-stats strip (the old home's StatsBar) — live count, sold
 * this month, makes on offer, regions covered. Fed by the counts the home
 * already computes; renders nothing useful only if everything is zero.
 */
export function StatsBar({
  live,
  sold,
  makes,
  govs,
}: {
  live: number;
  sold: number;
  makes: number;
  govs: number;
}) {
  if (!live && !sold && !makes && !govs) return null;
  const items = [
    { Icon: Gavel, value: live, label: "en direct" },
    { Icon: Trophy, value: sold, label: "vendues / mois" },
    { Icon: Car, value: makes, label: "marques" },
    { Icon: MapPin, value: govs, label: "régions" },
  ];
  return (
    <section className="mt-5 px-4">
      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3.5 ring-1 ring-border">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center gap-1 text-center">
            <it.Icon className="size-4 text-gold" strokeWidth={2} />
            <span className="batta-tabular gradient-gold-text text-[17px] font-extrabold leading-none">
              {it.value}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] leading-tight text-muted">
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
