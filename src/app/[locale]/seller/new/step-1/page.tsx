"use client";

import { useRouter } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Input } from "@/components/ui/Input";
import { NumberField } from "@/components/ui/NumberField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { scrollToFirstInvalid } from "@/lib/validation";

const makes = [
  "Renault",
  "Peugeot",
  "Volkswagen",
  "Toyota",
  "Hyundai",
  "BMW",
  "Mercedes",
  "Citroën",
  "Fiat",
  "Kia",
  "Skoda",
  "Audi",
  "Ford",
];

const fuels = [
  { v: "gasoline", l: "Essence" },
  { v: "diesel", l: "Diesel" },
  { v: "hybrid", l: "Hybride" },
  { v: "electric", l: "Électrique" },
];
const conditions = [
  { v: "new", l: "Neuf" },
  { v: "excellent", l: "Excellent" },
  { v: "good", l: "Bon" },
  { v: "fair", l: "Acceptable" },
  { v: "damaged", l: "Endommagé" },
];
const categories = [
  { v: "sedan", l: "Berline" },
  { v: "suv", l: "SUV" },
  { v: "hatchback", l: "Hatchback" },
  { v: "pickup", l: "Pick-up" },
  { v: "van", l: "Van" },
  { v: "coupe", l: "Coupé" },
  { v: "convertible", l: "Cabriolet" },
  { v: "wagon", l: "Break" },
];
const featureOpts = [
  "Climatisation",
  "ABS",
  "ESP",
  "Airbags",
  "Système audio",
  "Bluetooth",
  "Caméra de recul",
  "Phares LED",
  "Apple CarPlay",
  "Android Auto",
  "Sunroof",
  "Cuir",
  "Cruise Control",
];

export default function Step1Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const features = draft.features ?? [];

  function toggleFeature(f: string) {
    const next = features.includes(f)
      ? features.filter((x) => x !== f)
      : [...features, f];
    update({ features: next });
  }

  function next() {
    const required: (keyof typeof draft)[] = [
      "make",
      "model",
      "year",
      "mileage",
      "fuelType",
      "transmission",
      "color",
      "category",
      "condition",
      "city",
      "region",
    ];
    const missing = required.filter((k) => !draft[k]);
    if (missing.length) {
      scrollToFirstInvalid(missing as string[]);
      toast("Veuillez compléter les champs en rouge", "warning");
      return;
    }
    router.push("/seller/new/step-2");
  }

  return (
    <CreateAuctionShell current={0}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Données du véhicule</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Informations essentielles que les acheteurs doivent connaître
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marque" name="make">
            <select
              className="select-field"
              value={draft.make ?? ""}
              onChange={(e) => update({ make: e.target.value })}
            >
              <option value="">Choisir</option>
              {makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modèle" name="model">
            <Input
              placeholder="Clio"
              value={draft.model ?? ""}
              onChange={(e) => update({ model: e.target.value })}
            />
          </Field>
          <Field label="Année" name="year">
            <NumberField
              placeholder="2022"
              value={draft.year}
              onChange={(n) => update({ year: n })}
            />
          </Field>
          <Field label="Kilométrage" name="mileage">
            <NumberField
              placeholder="50000"
              value={draft.mileage}
              onChange={(n) => update({ mileage: n })}
            />
          </Field>
          <Field label="Carburant" name="fuelType">
            <select
              className="select-field"
              value={draft.fuelType ?? ""}
              onChange={(e) =>
                update({
                  fuelType:
                    (e.target.value as typeof draft.fuelType) || undefined,
                })
              }
            >
              <option value="">Choisir</option>
              {fuels.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Boîte de vitesses" name="transmission">
            <select
              className="select-field"
              value={draft.transmission ?? ""}
              onChange={(e) =>
                update({
                  transmission:
                    (e.target.value as typeof draft.transmission) || undefined,
                })
              }
            >
              <option value="">Choisir</option>
              <option value="manual">Manuel</option>
              <option value="automatic">Automatique</option>
            </select>
          </Field>
          <Field label="Couleur" name="color">
            <Input
              placeholder="Blanc"
              value={draft.color ?? ""}
              onChange={(e) => update({ color: e.target.value })}
            />
          </Field>
          <Field label="Catégorie" name="category">
            <select
              className="select-field"
              value={draft.category ?? ""}
              onChange={(e) =>
                update({
                  category:
                    (e.target.value as typeof draft.category) || undefined,
                })
              }
            >
              <option value="">Choisir</option>
              {categories.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Statut" name="condition">
          <select
            className="select-field"
            value={draft.condition ?? ""}
            onChange={(e) =>
              update({
                condition:
                  (e.target.value as typeof draft.condition) || undefined,
              })
            }
          >
            <option value="">Choisir</option>
            {conditions.map((c) => (
              <option key={c.v} value={c.v}>
                {c.l}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Numéro de châssis (VIN)">
          <Input
            placeholder="VF1XXXXXXXXXXXX"
            value={draft.vin ?? ""}
            onChange={(e) => update({ vin: e.target.value })}
          />
        </Field>

        <Field label="Numéro de plaque">
          <Input
            placeholder="123 Tunis 4567"
            value={draft.registration ?? ""}
            onChange={(e) => update({ registration: e.target.value })}
          />
        </Field>

        <Field label="Site" name="city">
          <div className="grid grid-cols-2 gap-2" data-field="region">
            <Input
              placeholder="Ville"
              value={draft.city ?? ""}
              onChange={(e) => update({ city: e.target.value })}
            />
            <Input
              placeholder="Région"
              value={draft.region ?? ""}
              onChange={(e) => update({ region: e.target.value })}
            />
          </div>
        </Field>

        <Field label="Description">
          <textarea
            placeholder="Rédigez une description détaillée de la voiture..."
            rows={4}
            value={draft.description ?? ""}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-foreground placeholder:text-[var(--foreground-subtle)] focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 resize-none"
          />
        </Field>

        <Field label="Caractéristiques">
          <div className="flex flex-wrap gap-2">
            {featureOpts.map((f) => {
              const checked = features.includes(f);
              return (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    checked
                      ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                      : "border-[var(--border)] text-foreground hover:border-[var(--gold)]"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.push("/seller/dashboard")}
          >
            Enregistrer et quitter
          </Button>
          <Button size="lg" fullWidth onClick={next}>
            Continuer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <style jsx>{`
        :global(.select-field) {
          height: 44px;
          width: 100%;
          padding: 0 16px;
          background: var(--surface);
          color: var(--foreground);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          font-size: 16px;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23a1a1a1' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: left 16px center;
        }
        :global(.select-field:focus) {
          border-color: var(--gold);
          outline: none;
        }
      `}</style>
    </CreateAuctionShell>
  );
}

function Field({
  label,
  name,
  children,
}: {
  label: string;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={name}>
      <label className="text-xs font-semibold text-[var(--foreground-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
