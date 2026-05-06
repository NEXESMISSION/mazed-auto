import type { Vehicle } from "@/lib/types";
import { formatNumber } from "@/lib/format";

const fuelLabels = {
  gasoline: "Essence",
  diesel: "Diesel",
  hybrid: "Hybride",
  electric: "Électrique",
};

const transmissionLabels = {
  manual: "Manuel",
  automatic: "Automatique",
};

const conditionLabels = {
  new: "Neuf",
  excellent: "Excellent",
  good: "Bon",
  fair: "Acceptable",
  damaged: "Endommagé",
};

const conditionTone: Record<string, string> = {
  new: "text-emerald-400",
  excellent: "text-emerald-400",
  good: "text-[var(--gold-bright)]",
  fair: "text-amber-400",
  damaged: "text-red-400",
};

const categoryLabels = {
  sedan: "Berline",
  suv: "SUV",
  hatchback: "Hatchback",
  pickup: "Pick-up",
  van: "Van",
  coupe: "Coupé",
  convertible: "Cabriolet",
  wagon: "Break",
};

interface Props {
  vehicle: Vehicle;
}

export function SpecsGrid({ vehicle }: Props) {
  const specs: { label: string; value: React.ReactNode; valueClass?: string }[] = [
    { label: "Année", value: vehicle.year },
    {
      label: "Kilométrage",
      value: (
        <>
          {formatNumber(vehicle.mileage)}
          <span className="text-[var(--foreground-muted)] font-normal">
            {" "}
            km
          </span>
        </>
      ),
    },
    { label: "Carburant", value: fuelLabels[vehicle.fuelType] },
    { label: "Boîte de vitesses", value: transmissionLabels[vehicle.transmission] },
    { label: "Couleur", value: vehicle.color },
    { label: "Catégorie", value: categoryLabels[vehicle.category] },
    { label: "Site", value: vehicle.city },
    {
      label: "Statut",
      value: conditionLabels[vehicle.condition],
      valueClass: conditionTone[vehicle.condition],
    },
  ];

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
      {specs.map((s, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between py-3 border-b border-[var(--border)] last:border-0 sm:[&:nth-last-child(2)]:border-0"
        >
          <dt className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold">
            {s.label}
          </dt>
          <dd
            className={`text-sm font-bold tabular-nums ${s.valueClass ?? ""}`}
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
