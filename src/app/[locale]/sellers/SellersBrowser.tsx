"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Search,
  X,
  SearchX,
  Star,
  ShieldCheck,
  ChevronRight,
  Award,
  MapPin,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Seller } from "@/lib/types";

type EnrichedSeller = Seller & { liveCount: number };

interface Props {
  sellers: EnrichedSeller[];
}

/**
 * Full sellers directory — pill search at the top, full list below. Filters
 * by display name, username, or city as the user types. Mirrors the search
 * affordance from /auctions so the two pages feel like a pair.
 */
export function SellersBrowser({ sellers }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q),
    );
  }, [sellers, search]);

  return (
    <div className="pt-2">
      {/* Pill search — same shape as /auctions */}
      <div className="px-4">
        <div className="flex items-center gap-3 rounded-full bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--gold-soft)] transition-colors ps-4 pe-1.5 h-12">
          <Search className="h-4 w-4 text-[var(--foreground-muted)] shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ville..."
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

      {/* Count line */}
      <div className="px-4 mt-4 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {search ? "Résultats" : "Tous les vendeurs"}
        </h2>
        <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
          {filtered.length} {filtered.length === 1 ? "vendeur" : "vendeurs"}
        </span>
      </div>

      {filtered.length === 0 ? (
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
        <ul className="mt-3 px-4 pb-4 space-y-2.5">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link
                href={`/profile/${s.username}`}
                className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3 hover:border-[var(--gold-soft)] transition-colors group"
              >
                <Avatar size="md" src={s.avatarUrl} alt={s.displayName} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[14px] truncate group-hover:text-[var(--gold)] transition-colors">
                      {s.displayName}
                    </span>
                    {s.verifiedKyc && (
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                    )}
                    {s.isPro && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--gold)] text-black text-[9px] font-extrabold uppercase tracking-wider">
                        <Award className="h-2.5 w-2.5" />
                        Pro
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--foreground-muted)] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
                      <span className="font-bold tabular-nums text-foreground">
                        {s.ratingAverage > 0
                          ? s.ratingAverage.toFixed(1)
                          : "—"}
                      </span>
                      {s.ratingCount > 0 && <span>({s.ratingCount})</span>}
                    </span>
                    <span className="text-[var(--border-strong)]">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {s.city}
                    </span>
                    {s.liveCount > 0 && (
                      <>
                        <span className="text-[var(--border-strong)]">·</span>
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--gold)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)] pulse-gold" />
                          {s.liveCount} En direct
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)] shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
