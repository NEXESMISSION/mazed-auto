"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, Zap, Car, Gauge, Mountain, Sparkles } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Input } from "@/components/ui/Input";
import { NumberField } from "@/components/ui/NumberField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft, clearDraft, type AuctionDraft } from "@/lib/draft";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { scrollToFirstInvalid } from "@/lib/validation";

const DEV_PHOTOS = [
  "https://images.unsplash.com/photo-1493238792000-8113da705763?w=900&q=80",
  "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=900&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=900&q=80",
  "https://images.unsplash.com/photo-1542362567-b07e54358753?w=900&q=80",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=900&q=80",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=900&q=80",
];

const makes = [
  "Renault", "Peugeot", "Volkswagen", "Toyota", "Hyundai", "BMW", "Mercedes",
  "Citroën", "Fiat", "Kia", "Skoda", "Audi", "Ford",
];

const IS_DEV = process.env.NODE_ENV !== "production";

interface Preset {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  startingPrice: number;
  reservePrice: number;
  buyNowPrice: number;
  data: Partial<AuctionDraft>;
}

// Dev-only one-click test auctions. Each click skips the wizard entirely
// and inserts a fully-formed `active` auction in the database. Stripped from
// prod via IS_DEV.
const PRESETS: Preset[] = [
    {
      label: "Renault Clio",
      Icon: Car,
      startingPrice: 28000,
      reservePrice: 35000,
      buyNowPrice: 42000,
      data: {
        make: "Renault",
        model: "Clio 5",
        year: 2020,
        mileage: 65000,
        fuelType: "gasoline",
        transmission: "manual",
        color: "Blanc",
        category: "hatchback",
        condition: "good",
        vin: "VF15RBL0H64123456",
        registration: "123 Tunis 4567",
        city: "Tunis",
        region: "Ariana",
        description:
          "Clio 5 modèle 2020, entretien régulier chez le concessionnaire, état excellent, climatisation fonctionnelle, pneus neufs.",
        features: ["Climatisation", "ABS", "Airbags", "Bluetooth", "Phares LED"],
      },
    },
    {
      label: "VW Golf",
      Icon: Gauge,
      startingPrice: 35000,
      reservePrice: 42000,
      buyNowPrice: 50000,
      data: {
        make: "Volkswagen",
        model: "Golf 7",
        year: 2018,
        mileage: 110000,
        fuelType: "diesel",
        transmission: "manual",
        color: "Gris",
        category: "hatchback",
        condition: "good",
        vin: "WVWZZZ1JZJW123456",
        registration: "456 Tunis 7890",
        city: "Sfax",
        region: "Sfax Ouest",
        description:
          "Golf 7 Diesel 2018, économe en carburant, entretien documenté, régulateur de vitesse, Apple CarPlay.",
        features: [
          "Climatisation",
          "ABS",
          "ESP",
          "Airbags",
          "Bluetooth",
          "Apple CarPlay",
          "Cruise Control",
          "Caméra de recul",
        ],
      },
    },
    {
      label: "BMW X3",
      Icon: Mountain,
      startingPrice: 120000,
      reservePrice: 145000,
      buyNowPrice: 165000,
      data: {
        make: "BMW",
        model: "X3 xDrive 20d",
        year: 2022,
        mileage: 35000,
        fuelType: "diesel",
        transmission: "automatic",
        color: "Noir",
        category: "suv",
        condition: "excellent",
        vin: "WBAXG7C50N0123456",
        registration: "789 Tunis 1234",
        city: "Tunis",
        region: "Lac",
        description:
          "BMW X3 2022 état impeccable comme neuve, 4 roues motrices, toit panoramique, cuir, grand écran, garantie constructeur en cours.",
        features: [
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
        ],
      },
    },
    {
      label: "Toyota Yaris",
      Icon: Sparkles,
      startingPrice: 65000,
      reservePrice: 75000,
      buyNowPrice: 85000,
      data: {
        make: "Toyota",
        model: "Yaris Hybrid",
        year: 2024,
        mileage: 8000,
        fuelType: "hybrid",
        transmission: "automatic",
        color: "Bleu",
        category: "hatchback",
        condition: "new",
        vin: "JTDKAMFP00M123456",
        registration: "321 Tunis 6543",
        city: "Sousse",
        region: "Sousse Ville",
        description:
          "Yaris Hybrid 2024 neuve, consommation très faible (~3,8 L/100 km), garantie constructeur jusqu'en 2027.",
        features: [
          "Climatisation",
          "ABS",
          "ESP",
          "Airbags",
          "Bluetooth",
          "Caméra de recul",
          "Phares LED",
          "Apple CarPlay",
          "Android Auto",
          "Cruise Control",
        ],
      },
    },
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
  "Climatisation", "ABS", "ESP", "Airbags", "Système audio", "Bluetooth", "Caméra de recul",
  "Phares LED", "Apple CarPlay", "Android Auto", "Sunroof", "Cuir", "Cruise Control",
];

export default function Step1Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const { user } = useAuth();
  const features = draft.features ?? [];
  const [creating, setCreating] = useState<string | null>(null);

  // Dev-only: build a complete auction row from a preset and insert it
  // straight into the DB, skipping every wizard step. Goes live immediately
  // so we can bid on it from another browser/account right away.
  async function createTestAuction(p: Preset) {
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      router.push("/login");
      return;
    }
    setCreating(p.label);
    const supabase = createClient();
    const d = p.data;

    // 1) Upsert seller row with KYC verified so admin gates pass.
    const username = (
      user.email?.split("@")[0] || `seller_${user.id.slice(0, 6)}`
    ).toLowerCase();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || username;

    const { error: sellerErr } = await supabase.from("sellers").upsert(
      {
        id: user.id,
        username,
        display_name: displayName,
        city: d.city || "Tunis",
        trust_score: 100,
        trust_level: "trusted",
        verified_kyc: true,
        verified_ownership: true,
        account_age_months: 6,
        successful_deals: 3,
      },
      { onConflict: "id" },
    );
    if (sellerErr) {
      setCreating(null);
      toast("Échec : Créer le vendeur: " + sellerErr.message, "error");
      return;
    }

    // 2) Insert the auction. Status 'active' so it's biddable immediately
    //    in test mode. 7-day duration starting now.
    const now = new Date();
    const endTime = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const bidIncrement =
      p.startingPrice >= 100000 ? 1000 : p.startingPrice >= 30000 ? 500 : 250;

    const { data: auction, error: auctionErr } = await supabase
      .from("auctions")
      .insert({
        seller_id: user.id,
        make: d.make,
        model: d.model,
        year: d.year,
        mileage: d.mileage ?? 0,
        fuel_type: d.fuelType,
        transmission: d.transmission,
        color: d.color,
        condition: d.condition,
        category: d.category,
        description: d.description ?? null,
        features: d.features ?? [],
        city: d.city,
        region: d.region,
        image_urls: Array.from(
          { length: 12 },
          (_, i) => DEV_PHOTOS[i % DEV_PHOTOS.length],
        ),
        video_url:
          "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        starting_price: p.startingPrice,
        reserve_price: p.reservePrice,
        buy_now_price: p.buyNowPrice,
        current_price: p.startingPrice,
        participation_deposit: Math.round(p.startingPrice * 0.05),
        bid_increment: bidIncrement,
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        original_end_time: endTime.toISOString(),
        status: "active",
        reserve_met: false,
      })
      .select("id")
      .single();

    setCreating(null);

    if (auctionErr) {
      toast("Échec de la création de l'enchère: " + auctionErr.message, "error");
      return;
    }

    // Clear any in-progress draft so the wizard isn't half-populated next time
    clearDraft();
    toast(`✓ Enchère ${p.label} créée`, "success");
    router.push(`/auctions/${auction.id}`);
    router.refresh();
  }

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

        {IS_DEV && (
          <div className="rounded-[var(--radius-md)] border border-dashed border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                <Zap className="h-3.5 w-3.5" />
                Mode test · Créer une enchère prête en un clic
              </div>
              <span className="text-[10px] text-amber-300/70">
                Ignore toutes les étapes
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={creating !== null}
                  onClick={() => createTestAuction(p)}
                  className="px-2.5 py-2.5 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-foreground flex items-center gap-2 transition-colors text-start"
                >
                  <span className="h-8 w-8 rounded-md bg-amber-500/10 text-amber-300 flex items-center justify-center shrink-0">
                    <p.Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{p.label}</span>
                    <span className="block text-[10px] font-normal text-[var(--foreground-muted)] truncate">
                      {creating === p.label
                        ? "Création en cours..."
                        : `${p.startingPrice.toLocaleString("fr-TN")} - ${p.buyNowPrice.toLocaleString("fr-TN")} DT`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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
