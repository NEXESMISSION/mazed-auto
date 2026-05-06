"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  X,
  SearchX,
  Star,
  ShieldCheck,
  ChevronRight,
  Flame,
  Sparkles,
  Layers,
  Car,
  Cog,
  Fuel,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { useRealtimeAuctionList } from "@/lib/realtime";
import type { Auction, Seller } from "@/lib/types";

interface Props {
  initial: Auction[];
  sellers: Seller[];
}

// ── Quick filters ───────────────────────────────────────────
// Each filter has an `apply` predicate. They're additive — a single
// filter is active at a time (radio-style) so the chip row stays simple.
type FilterKey =
  | "all"
  | "live"
  | "ending"
  | "new"
  | "cheap"
  | "suv"
  | "auto"
  | "diesel";

const FILTERS: Array<{
  key: FilterKey;
  label: string;
  icon: LucideIcon;
  apply: (a: Auction) => boolean;
}> = [
  { key: "all",    label: "Tous",         icon: Layers,    apply: () => true },
  { key: "live",   label: "En direct",        icon: Flame,
    apply: (a) => a.status === "active" || a.status === "ending" },
  { key: "ending", label: "Bientôt terminé", icon: Flame,
    apply: (a) => a.endTime.getTime() - Date.now() < 24 * 60 * 60 * 1000
      && (a.status === "active" || a.status === "ending") },
  { key: "new",    label: "Neuf",         icon: Sparkles,
    apply: (a) => a.vehicle.condition === "new" },
  { key: "cheap",  label: "Moins de 50K",      icon: Tag,
    apply: (a) => a.currentPrice < 50000 },
  { key: "suv",    label: "SUV",          icon: Car,
    apply: (a) => a.vehicle.category === "suv" },
  { key: "auto",   label: "Automatique",    icon: Cog,
    apply: (a) => a.vehicle.transmission === "automatic" },
  { key: "diesel", label: "Diesel",         icon: Fuel,
    apply: (a) => a.vehicle.fuelType === "diesel" },
];

/**
 * Search-and-results screen — pill search bar, filter chips, then two stacked
 * sections (Sellers + Products) that filter as the user types or taps a chip.
 */
export function AuctionsBrowser({ initial, sellers }: Props) {
  const list = useRealtimeAuctionList(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const filteredAuctions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      if (!activeFilter.apply(a)) return false;
      if (!q) return true;
      return (
        a.vehicle.make.toLowerCase().includes(q) ||
        a.vehicle.model.toLowerCase().includes(q) ||
        a.vehicle.city.toLowerCase().includes(q) ||
        a.vehicle.color.toLowerCase().includes(q)
      );
    });
  }, [list, search, activeFilter]);

  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q),
    );
  }, [sellers, search]);

  // Show the "no results" panel when EITHER a search produced nothing across
  // both sections, OR a non-default filter chip narrows the auctions list to
  // nothing (sellers don't participate in chip filters, so we also check
  // that the user actually typed a query before hiding the sellers row).
  const filterActive = filter !== "all";
  const noResults =
    (search.trim() &&
      filteredAuctions.length === 0 &&
      filteredSellers.length === 0) ||
    (filterActive && filteredAuctions.length === 0 && !search.trim());

  return (
    <div className="pt-5">
      {/* Pill search bar — leading search icon, clear button on the trailing
          edge when there's a query. The previous gold pill on the right was
          loud and felt like a separate "submit" affordance; this is calmer. */}
      <div className="px-4">
        <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors pl-4 pr-1.5 h-12">
          <Search className="h-4 w-4 text-[var(--foreground-muted)] shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une voiture, un vendeur, une ville..."
            // 16px font prevents iOS Safari from auto-zooming on focus.
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

      {/* Filter chips — horizontal scroll, single-select. Active chip flips
          to gold-fill so the current filter is unmissable. */}
      <div className="mt-4 overflow-x-auto hide-scrollbar">
        <div className="flex gap-2 px-4 pb-1">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold transition-colors ${
                  active
                    ? "bg-[var(--gold)] text-black border border-[var(--gold)] shadow-[var(--shadow-gold)]"
                    : "bg-[var(--surface)] text-[var(--foreground-muted)] border border-[var(--border)] hover:border-[var(--gold-soft)] hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results heading */}
      <h1 className="px-4 mt-5 text-2xl font-extrabold tracking-tight">
        Résultats
      </h1>

      {noResults ? (
        <div className="text-center py-16 space-y-3 px-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
            <SearchX className="h-7 w-7" />
          </div>
          <div className="font-bold text-base">Aucun résultat</div>
          <p className="text-xs text-[var(--foreground-muted)]">
            Essayez un autre mot-clé
          </p>
        </div>
      ) : (
        <>
          {/* Sellers section — small horizontal-scroll chips (avatar + name +
              rating). A trailing "see more" tile takes you to /sellers when
              you want the full directory. */}
          {filteredSellers.length > 0 && (
            <section className="mt-5">
              <SectionHeader
                label="Vendeurs"
                count={filteredSellers.length}
                href="/sellers"
              />
              <div className="mt-2.5 overflow-x-auto hide-scrollbar">
                <div className="flex gap-2 px-4 pb-1">
                  {filteredSellers.slice(0, 4).map((s) => (
                    <Link
                      key={s.id}
                      href={`/profile/${s.username}`}
                      className="group w-[100px] shrink-0 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-2.5 hover:border-[var(--gold-soft)] transition-colors flex flex-col items-center text-center"
                    >
                      <div className="relative">
                        <Avatar size="md" src={s.avatarUrl} alt={s.displayName} />
                        {s.verifiedKyc && (
                          <span
                            className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full bg-[var(--gold)] border-2 border-[var(--surface)] flex items-center justify-center"
                            title="Identité vérifiée"
                          >
                            <ShieldCheck
                              className="h-2.5 w-2.5 text-black"
                              strokeWidth={3}
                            />
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 font-bold text-[11px] truncate w-full leading-tight group-hover:text-[var(--gold)] transition-colors">
                        {s.displayName}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--foreground-muted)] tabular-nums">
                        <Star className="h-2.5 w-2.5 fill-[var(--gold)] text-[var(--gold)]" />
                        <span className="font-bold text-foreground">
                          {s.ratingAverage > 0
                            ? s.ratingAverage.toFixed(1)
                            : "—"}
                        </span>
                      </div>
                    </Link>
                  ))}

                  {/* Trailing "see more" tile — same width as the chips so
                      the rail rhythm stays consistent. */}
                  <Link
                    href="/sellers"
                    className="group w-[100px] shrink-0 rounded-2xl bg-[var(--surface)] border border-dashed border-[var(--border)] p-2.5 hover:border-[var(--gold)] hover:bg-[var(--gold-faint)] transition-colors flex flex-col items-center justify-center text-center"
                  >
                    <span className="h-10 w-10 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] group-hover:bg-[var(--gold)] group-hover:text-black flex items-center justify-center transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                    <div className="mt-1.5 font-bold text-[11px] text-[var(--gold)] leading-tight">
                      Voir tout
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--foreground-muted)] tabular-nums">
                      {filteredSellers.length}+
                    </div>
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* Products section */}
          {filteredAuctions.length > 0 && (
            <section className="mt-7">
              <SectionHeader
                label="Enchères"
                count={filteredAuctions.length}
                href="/auctions"
              />
              <div className="mt-2.5 grid grid-cols-2 gap-3 px-4 pb-4">
                {filteredAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SectionHeader({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href: string;
}) {
  return (
    <div className="px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-[15px]">{label}</h2>
        <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
          {count}
        </span>
      </div>
      <Link
        href={href}
        aria-label="Tous"
        className="h-7 w-7 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)] hover:border-[var(--gold-soft)] hover:text-[var(--gold)] transition-colors"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
