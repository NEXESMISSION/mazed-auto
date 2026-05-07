"use client";

import { useState, useMemo } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  Search,
  X,
  SearchX,
  ChevronLeft,
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
 * Two-mode browse:
 *
 *   HUB MODE  (no query params)
 *     Search bar + Marques grid + Catégories grid. Tapping a brand or
 *     category card pushes a URL with the corresponding query param,
 *     which switches the page into LIST MODE.
 *
 *   LIST MODE (?brand=… or ?body=…)
 *     Back-to-hub header + active-filter pill + filtered AuctionCard
 *     grid. Search still works (narrows within the active filter).
 *
 * URLs are bookmarkable: /auctions?brand=Mercedes can be shared and
 * lands directly on the Mercedes results.
 */
export function AuctionsBrowser({ initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const brand = params.get("brand");
  const body = params.get("body") as VehicleCategory | null;

  const list = useRealtimeAuctionList(initial);
  const [search, setSearch] = useState("");

  const inListMode = brand !== null || body !== null;

  // Brand index — count + first matching auction's image as the box bg.
  const brandIndex = useMemo(() => {
    const data = new Map<string, { count: number; image?: string }>();
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

  // Body-type index — full taxonomy, with image when at least one auction
  // matches.
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

  // Compose the active-filter human label for the list-mode header.
  const filterLabel = brand ?? (body ? BODY_LABEL[body] : "");

  return (
    <div className="pt-5 pb-8">
      {/* Search bar — present in both modes. */}
      <div className="px-4">
        <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors pl-4 pr-1.5 h-12">
          <Search className="h-4 w-4 text-[var(--foreground-muted)] shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              inListMode
                ? `Filtrer dans ${filterLabel}…`
                : "Rechercher une voiture, une ville..."
            }
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

      {inListMode ? (
        /* ─────────── LIST MODE ─────────── */
        <>
          {/* Back-to-hub header */}
          <div className="px-4 mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/auctions")}
              aria-label="Retour aux catégories"
              className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center shadow-[var(--shadow-md)] hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                {brand ? "Marque" : "Catégorie"}
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight truncate">
                {filterLabel}
              </h1>
            </div>
            <span className="shrink-0 inline-flex items-center justify-center h-8 min-w-[2.5rem] px-2.5 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)] text-[var(--gold)] text-[12px] font-extrabold tabular-nums">
              {filteredAuctions.length}
            </span>
          </div>

          {/* Filtered grid */}
          {filteredAuctions.length === 0 ? (
            <div className="text-center py-16 space-y-3 px-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
                <SearchX className="h-7 w-7" />
              </div>
              <div className="font-bold text-base">Aucune enchère</div>
              <p className="text-xs text-[var(--foreground-muted)]">
                Aucune annonce ne correspond à ce filtre pour le moment.
              </p>
              <button
                type="button"
                onClick={() => router.push("/auctions")}
                className="inline-flex items-center h-9 px-4 rounded-full bg-[var(--gold)] text-black text-[12px] font-bold shadow-[var(--shadow-gold)]"
              >
                Voir toutes les catégories
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 px-4">
              {filteredAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          )}
        </>
      ) : (
        /* ─────────── HUB MODE ─────────── */
        <>
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
                    onClick={() =>
                      router.push(
                        `/auctions?brand=${encodeURIComponent(b.name)}`,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Body-type grid */}
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
                  onClick={() =>
                    router.push(
                      `/auctions?body=${encodeURIComponent(bt.value)}`,
                    )
                  }
                />
              ))}
            </div>
          </section>

          {/* Sellers shortcut at bottom */}
          <div className="mt-6 px-4">
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
        </>
      )}
    </div>
  );
}

function ImageBox({
  label,
  count,
  image,
  fallbackInitials,
  fallbackIcon: FallbackIcon,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  image?: string;
  fallbackInitials?: string;
  fallbackIcon?: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative aspect-[4/5] rounded-2xl overflow-hidden flex items-end transition-all disabled:opacity-40 disabled:cursor-not-allowed ring-1 ring-[var(--border)] hover:ring-2 hover:ring-[var(--gold-soft)] active:scale-[0.98]"
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
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
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        </span>
      )}

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
