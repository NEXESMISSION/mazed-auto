"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Search,
  X,
  SearchX,
  Car,
  Truck,
  Caravan,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { useRealtimeAuctionList } from "@/lib/realtime";
import type { Auction, VehicleCategory } from "@/lib/types";

interface Props {
  initial: Auction[];
}

// Body-type metadata. Every category appears in the grid even when no
// current auction matches it — empty ones render with the logo fallback
// and are disabled, so users still see the full taxonomy.
const BODY_TYPES: Array<{
  value: VehicleCategory;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "sedan",       label: "Berline",      icon: Car },
  { value: "suv",         label: "SUV",          icon: Truck },
  { value: "hatchback",   label: "Citadine",     icon: Car },
  { value: "pickup",      label: "Pickup",       icon: Truck },
  { value: "coupe",       label: "Coupé",        icon: Car },
  { value: "convertible", label: "Cabriolet",    icon: Car },
  { value: "wagon",       label: "Break",        icon: Car },
  { value: "van",         label: "Utilitaire",   icon: Caravan },
];

const BODY_LABEL: Record<VehicleCategory, string> = Object.fromEntries(
  BODY_TYPES.map((b) => [b.value, b.label]),
) as Record<VehicleCategory, string>;

/**
 * Category-first browse: search bar + a uniform pair of image-backed
 * grids — one for brands (computed live from the data) and one for body
 * types (the full 8-entry taxonomy, with the logo as fallback for
 * categories that have no current auction). Tapping a card filters the
 * results grid below; an active-filter pill row makes the current
 * selection visible and one-tap clearable.
 */
export function AuctionsBrowser({ initial }: Props) {
  const list = useRealtimeAuctionList(initial);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [body, setBody] = useState<VehicleCategory | null>(null);

  // Brands index: count + a representative image (first auction in that
  // brand) so each card has a real photo of one of its cars.
  const brandIndex = useMemo(() => {
    const data = new Map<
      string,
      { count: number; image?: string }
    >();
    for (const a of list) {
      const m = a.vehicle.make.trim();
      if (!m) continue;
      const existing = data.get(m);
      data.set(m, {
        count: (existing?.count ?? 0) + 1,
        image: existing?.image ?? a.vehicle.imageUrls[0],
      });
    }
    return Array.from(data.entries())
      .map(([name, d]) => ({ name, count: d.count, image: d.image }))
      .sort((a, b) => b.count - a.count);
  }, [list]);

  // Body-type index: every taxonomy entry, paired with the first matching
  // auction's image when one exists.
  const bodyIndex = useMemo(() => {
    const firstByCategory = new Map<VehicleCategory, string>();
    const counts = new Map<VehicleCategory, number>();
    for (const a of list) {
      const c = a.vehicle.category;
      counts.set(c, (counts.get(c) ?? 0) + 1);
      if (!firstByCategory.has(c) && a.vehicle.imageUrls[0]) {
        firstByCategory.set(c, a.vehicle.imageUrls[0]);
      }
    }
    return BODY_TYPES.map((b) => ({
      ...b,
      count: counts.get(b.value) ?? 0,
      image: firstByCategory.get(b.value),
    }));
  }, [list]);

  const filteredAuctions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (brand && a.vehicle.make !== brand) return false;
      if (body && a.vehicle.category !== body) return false;
      if (!q) return true;
      return (
        a.vehicle.make.toLowerCase().includes(q) ||
        a.vehicle.model.toLowerCase().includes(q) ||
        a.vehicle.city.toLowerCase().includes(q) ||
        a.vehicle.color.toLowerCase().includes(q)
      );
    });
  }, [list, search, brand, body]);

  const filterActive = brand !== null || body !== null;

  return (
    <div className="pt-5 pb-8">
      {/* Pill search bar */}
      <div className="px-4">
        <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors pl-4 pr-1.5 h-12">
          <Search className="h-4 w-4 text-[var(--foreground-muted)] shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une voiture, une ville..."
            className="flex-1 bg-transparent text-base placeholder:text-[var(--foreground-subtle)] focus:outline-none min-w-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer"
              className="h-8 w-8 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] flex items-center justify-center hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Brands grid */}
      {brandIndex.length > 0 && (
        <section className="mt-6">
          <SectionHeader label="Marques" count={brandIndex.length} />
          <div className="px-4 mt-2.5 grid grid-cols-3 gap-2.5">
            {brandIndex.map((b) => (
              <ImageBox
                key={b.name}
                label={b.name}
                count={b.count}
                image={b.image}
                fallbackInitials={b.name.slice(0, 2).toUpperCase()}
                active={brand === b.name}
                onClick={() => setBrand(brand === b.name ? null : b.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Body-type grid — every category, even empty ones (disabled) */}
      <section className="mt-6">
        <SectionHeader label="Catégories" count={BODY_TYPES.length} />
        <div className="px-4 mt-2.5 grid grid-cols-3 gap-2.5">
          {bodyIndex.map((bt) => (
            <ImageBox
              key={bt.value}
              label={bt.label}
              count={bt.count}
              image={bt.image}
              fallbackIcon={bt.icon}
              disabled={bt.count === 0}
              active={body === bt.value}
              onClick={() => setBody(body === bt.value ? null : bt.value)}
            />
          ))}
        </div>
      </section>

      {/* Active-filter pill */}
      {filterActive && (
        <div className="px-4 mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            Filtre :
          </span>
          {brand && (
            <button
              type="button"
              onClick={() => setBrand(null)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--gold)] text-black text-[12px] font-bold shadow-[var(--shadow-gold)]"
            >
              {brand}
              <X className="h-3 w-3" />
            </button>
          )}
          {body && (
            <button
              type="button"
              onClick={() => setBody(null)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--gold)] text-black text-[12px] font-bold shadow-[var(--shadow-gold)]"
            >
              {BODY_LABEL[body]}
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setBrand(null);
              setBody(null);
            }}
            className="text-[11px] font-semibold text-[var(--foreground-muted)] hover:text-foreground underline-offset-2 hover:underline"
          >
            Tout effacer
          </button>
        </div>
      )}

      {/* Results */}
      <section className="mt-6">
        <SectionHeader label="Résultats" count={filteredAuctions.length} />
        {filteredAuctions.length === 0 ? (
          <div className="text-center py-16 space-y-3 px-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
              <SearchX className="h-7 w-7" />
            </div>
            <div className="font-bold text-base">Aucune enchère</div>
            <p className="text-xs text-[var(--foreground-muted)]">
              {filterActive
                ? "Essayez d'enlever un filtre"
                : "Essayez un autre mot-clé"}
            </p>
            {filterActive && (
              <button
                type="button"
                onClick={() => {
                  setBrand(null);
                  setBody(null);
                  setSearch("");
                }}
                className="inline-flex items-center h-9 px-4 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[12px] font-semibold hover:border-[var(--gold-soft)] transition-colors"
              >
                Voir toutes les enchères
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-3 px-4 pb-4">
            {filteredAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>

      {/* Sellers shortcut */}
      <div className="mt-2 px-4">
        <Link
          href="/sellers"
          className="block rounded-2xl bg-[var(--surface)] border border-dashed border-[var(--border)] p-4 hover:border-[var(--gold)] hover:bg-[var(--gold-faint)] transition-colors text-center"
        >
          <div className="text-[12px] font-semibold text-[var(--foreground-muted)] hover:text-foreground">
            Parcourir les vendeurs
          </div>
          <div className="text-[10px] text-[var(--foreground-subtle)] mt-0.5">
            Annuaire des concessionnaires et particuliers
          </div>
        </Link>
      </div>
    </div>
  );
}

/**
 * Square-ish image-backed box for the brand + category grids.
 * - With image: photo as backdrop + dark gradient + label/count.
 * - Without image: gradient + initials or icon fallback so the slot
 *   still has a visual identity.
 * - active=true: gold ring + faint gold tint.
 * - disabled=true: dimmed and not interactive.
 */
function ImageBox({
  label,
  count,
  image,
  fallbackInitials,
  fallbackIcon: FallbackIcon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  image?: string;
  fallbackInitials?: string;
  fallbackIcon?: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[4/5] rounded-2xl overflow-hidden flex items-end transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "ring-2 ring-[var(--gold)] shadow-[var(--shadow-gold)]"
          : "ring-1 ring-[var(--border)] hover:ring-[var(--gold-soft)]"
      }`}
    >
      {/* Background — photo or fallback */}
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {/* Bottom-up dark gradient so text is always legible */}
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        </>
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] flex items-center justify-center">
          {fallbackInitials ? (
            <span className="text-2xl font-extrabold text-[var(--gold)] tracking-tight">
              {fallbackInitials}
            </span>
          ) : FallbackIcon ? (
            <FallbackIcon className="h-7 w-7 text-[var(--gold)]" />
          ) : null}
          {/* Subtle bottom shade so the label stays readable on fallback too */}
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        </span>
      )}

      {/* Active gold tint overlay */}
      {active && (
        <span className="absolute inset-0 bg-[var(--gold)]/15 mix-blend-overlay pointer-events-none" />
      )}

      {/* Label + count */}
      <div className="relative w-full p-2.5 text-start">
        <div className="text-[12px] font-extrabold text-white truncate drop-shadow-sm">
          {label}
        </div>
        <div className="text-[10px] text-white/80 tabular-nums mt-0.5">
          {count} {count === 1 ? "voiture" : "voitures"}
        </div>
      </div>
    </button>
  );
}

function SectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="px-4 flex items-center gap-2">
      <h2 className="font-extrabold text-[15px]">{label}</h2>
      <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
        {count}
      </span>
    </div>
  );
}
