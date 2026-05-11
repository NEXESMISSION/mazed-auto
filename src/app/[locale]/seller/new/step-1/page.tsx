"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Input } from "@/components/ui/Input";
import { NumberField } from "@/components/ui/NumberField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { scrollToFirstInvalid } from "@/lib/validation";
import { createClient } from "@/lib/supabase/client";

// Fallback when cms_brands / cms_features tables are empty (fresh DB).
// Once the admin edits anything in /admin/cms/*, the DB version overrides.
const FALLBACK_MAKES = [
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

// Value lists are stable enum keys; the visible label is resolved via
// useTranslations("wizard") at render time so /fr and /ar both render
// in-language without each call site duplicating the list.
const FUEL_VALUES = ["gasoline", "diesel", "hybrid", "electric"] as const;
const CONDITION_VALUES = ["new", "excellent", "good", "fair", "damaged"] as const;
const CATEGORY_VALUES = [
  "sedan",
  "suv",
  "hatchback",
  "pickup",
  "van",
  "coupe",
  "convertible",
  "wagon",
] as const;
const FALLBACK_FEATURES = [
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
  const tWiz = useTranslations("wizard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const features = draft.features ?? [];

  // Hydrate brands / features / cities from the CMS tables. We start
  // with the fallback so the form is interactive on the first paint,
  // then swap to the DB version once the round-trip completes.
  const [makes, setMakes] = useState<string[]>(FALLBACK_MAKES);
  const [featureOpts, setFeatureOpts] = useState<string[]>(FALLBACK_FEATURES);
  const [cityOpts, setCityOpts] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    Promise.all([
      supabase
        .from("cms_brands")
        .select("display_name, position")
        .eq("is_active", true)
        .order("position", { ascending: true }),
      // Fetch BOTH locales' columns. Picking which one to show at render
      // time keeps the SQL static (no Bobby-Tables risk from injecting
      // the locale string) and means the same fetch result works for
      // both /fr and /ar without re-querying. Fixes audit finding #8 —
      // Arabic users were getting French CMS labels.
      supabase
        .from("cms_features")
        .select("label_fr, label_ar, position")
        .eq("is_active", true)
        .order("position", { ascending: true }),
      supabase
        .from("cms_cities")
        .select("slug, name_fr, name_ar, position")
        .eq("is_active", true)
        .order("position", { ascending: true }),
    ])
      .then(([brandsRes, featRes, citiesRes]) => {
        if (cancelled) return;
        if (brandsRes.data && brandsRes.data.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMakes(brandsRes.data.map((b) => b.display_name as string));
        }
        if (featRes.data && featRes.data.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFeatureOpts(
            featRes.data.map((f) => {
              const ar = (f.label_ar as string | null) ?? "";
              const fr = (f.label_fr as string | null) ?? "";
              // Fall back to fr if ar is empty — keeps the dropdown
              // populated even when admins haven't translated yet.
              return locale === "ar" && ar ? ar : fr;
            }),
          );
        }
        if (citiesRes.data && citiesRes.data.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCityOpts(
            citiesRes.data.map((c) => {
              const ar = (c.name_ar as string | null) ?? "";
              const fr = (c.name_fr as string | null) ?? "";
              return {
                slug: c.slug as string,
                name: locale === "ar" && ar ? ar : fr,
              };
            }),
          );
        }
      })
      .catch(() => {
        // CMS unreachable — keep the inline FALLBACK_* lists so the form
        // stays usable. Admins will see this in Supabase logs.
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

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
      toast(tWiz("step1.toastMissing"), "warning");
      return;
    }
    // VIN is optional, but if provided it must be a real 17-char VIN.
    // ISO 3779 excludes I, O, Q to avoid confusion with 1 and 0. Only
    // validate when the field has content — letting a seller skip it
    // is fine, but an obviously-bogus value like "x" would publish a
    // listing with junk data the admin queue would have to reject.
    const vin = (draft.vin ?? "").trim().toUpperCase();
    if (vin.length > 0 && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      scrollToFirstInvalid(["vin"]);
      toast(tWiz("step1.toastBadVin"), "warning");
      return;
    }
    router.push("/seller/new/step-2");
  }

  return (
    <CreateAuctionShell current={0}>
      <div className="space-y-5 lg:space-y-8">
        <div>
          <div className="hidden lg:block text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            {tWiz("step1.eyebrow")}
          </div>
          <h1 className="text-2xl lg:text-4xl font-extrabold lg:font-black lg:tracking-tight lg:mt-2">
            {tWiz("step1.title")}
          </h1>
          <p className="text-sm lg:text-base text-[var(--foreground-muted)] mt-1 lg:mt-3 lg:max-w-2xl">
            {tWiz("step1.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-5">
          <Field label={tWiz("field.make")} name="make">
            <select
              className="select-field"
              value={draft.make ?? ""}
              onChange={(e) => update({ make: e.target.value })}
            >
              <option value="">{tWiz("placeholder.choose")}</option>
              {makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tWiz("field.model")} name="model">
            <Input
              placeholder={tWiz("step1.modelPlaceholder")}
              value={draft.model ?? ""}
              onChange={(e) => update({ model: e.target.value })}
            />
          </Field>
          <Field label={tWiz("field.year")} name="year">
            <NumberField
              placeholder={tWiz("step1.yearPlaceholder")}
              value={draft.year}
              onChange={(n) => update({ year: n })}
            />
          </Field>
          <Field label={tWiz("field.mileage")} name="mileage">
            <NumberField
              placeholder={tWiz("step1.mileagePlaceholder")}
              value={draft.mileage}
              onChange={(n) => update({ mileage: n })}
            />
          </Field>
          <Field label={tWiz("field.fuelType")} name="fuelType">
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
              <option value="">{tWiz("placeholder.choose")}</option>
              {FUEL_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tWiz(`fuel.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tWiz("field.transmission")} name="transmission">
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
              <option value="">{tWiz("placeholder.choose")}</option>
              <option value="manual">{tWiz("transmission.manual")}</option>
              <option value="automatic">{tWiz("transmission.automatic")}</option>
            </select>
          </Field>
          <Field label={tWiz("field.color")} name="color">
            <Input
              placeholder={tWiz("step1.colorPlaceholder")}
              value={draft.color ?? ""}
              onChange={(e) => update({ color: e.target.value })}
            />
          </Field>
          <Field label={tWiz("field.category")} name="category">
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
              <option value="">{tWiz("placeholder.choose")}</option>
              {CATEGORY_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tWiz(`category.${v}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-5">
          <Field label={tWiz("field.condition")} name="condition">
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
              <option value="">{tWiz("placeholder.choose")}</option>
              {CONDITION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tWiz(`condition.${v}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={tWiz("field.vin")} name="vin">
            <Input
              placeholder={tWiz("step1.vinPlaceholder")}
              value={draft.vin ?? ""}
              maxLength={17}
              onChange={(e) =>
                update({
                  vin: e.target.value
                    .toUpperCase()
                    .replace(/[^A-HJ-NPR-Z0-9]/g, ""),
                })
              }
            />
          </Field>

          <Field label={tWiz("field.registration")}>
            <Input
              placeholder={tWiz("step1.registrationPlaceholder")}
              value={draft.registration ?? ""}
              onChange={(e) => update({ registration: e.target.value })}
            />
          </Field>
        </div>

        <Field label={tWiz("field.site")} name="city">
          <div className="grid grid-cols-2 gap-2 lg:gap-3" data-field="region">
            <Input
              placeholder={tWiz("field.city")}
              value={draft.city ?? ""}
              onChange={(e) => update({ city: e.target.value })}
              list="cms-cities"
            />
            <Input
              placeholder={tWiz("field.region")}
              value={draft.region ?? ""}
              onChange={(e) => update({ region: e.target.value })}
            />
          </div>
          {cityOpts.length > 0 && (
            <datalist id="cms-cities">
              {cityOpts.map((c) => (
                <option key={c.slug} value={c.name} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label={tWiz("field.description")}>
          <textarea
            placeholder={tWiz("step1.descriptionPlaceholder")}
            rows={4}
            value={draft.description ?? ""}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:py-4 text-base lg:text-[15px] text-foreground placeholder:text-[var(--foreground-subtle)] focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 resize-none lg:min-h-[140px]"
          />
        </Field>

        <Field label={tWiz("field.features")}>
          <div className="flex flex-wrap gap-2 lg:gap-2.5">
            {featureOpts.map((f) => {
              const checked = features.includes(f);
              return (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleFeature(f)}
                  className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-full border text-sm lg:text-[13px] font-medium lg:font-semibold transition-colors ${
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

        <div className="pt-4 lg:pt-6 lg:border-t lg:border-[var(--border)] flex flex-col-reverse sm:flex-row gap-2 lg:gap-3 lg:justify-end">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.push("/seller/dashboard")}
            className="lg:!w-auto lg:px-6"
          >
            {tWiz("action.saveExit")}
          </Button>
          <Button
            size="lg"
            fullWidth
            onClick={next}
            className="lg:!w-auto lg:px-8"
          >
            {tCommon("continue")}
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
