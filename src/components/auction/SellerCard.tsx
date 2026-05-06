import Link from "next/link";
import { Star, MapPin, ChevronRight, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Seller } from "@/lib/types";

interface Props {
  seller: Seller;
  /** "default" = full card, "compact" = inline single-row link */
  variant?: "default" | "compact";
}

export function SellerCard({ seller, variant = "default" }: Props) {
  if (variant === "compact") {
    return (
      <Link
        href={`/profile/${seller.username}`}
        className="flex items-center gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)]/40 transition-colors group"
      >
        <Avatar alt={seller.displayName} size="md" src={seller.avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-sm truncate group-hover:text-[var(--gold)] transition-colors">
              {seller.displayName}
            </span>
            {seller.verifiedKyc && (
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--foreground-muted)]">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
              {seller.ratingAverage > 0 ? seller.ratingAverage.toFixed(1) : "—"}
              {seller.ratingCount > 0 && (
                <span className="text-[var(--foreground-subtle)]">
                  ({seller.ratingCount})
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {seller.city}
            </span>
            {seller.successfulDeals > 0 && (
              <span className="font-bold text-[var(--foreground-muted)]">
                {seller.successfulDeals} {seller.successfulDeals === 1 ? "vente" : "ventes"}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--foreground-muted)] group-hover:text-[var(--gold)] transition-colors" />
      </Link>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
      <Link
        href={`/profile/${seller.username}`}
        className="flex items-start gap-3 group"
      >
        <Avatar alt={seller.displayName} size="lg" src={seller.avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base truncate group-hover:text-[var(--gold)] transition-colors">
              {seller.displayName}
            </span>
            {seller.verifiedKyc && (
              <ShieldCheck className="h-4 w-4 text-[var(--gold)] shrink-0" />
            )}
          </div>
          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
            @{seller.username}
          </div>
        </div>
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <Stat label="ventes" value={String(seller.successfulDeals)} />
        <Stat
          label="Évaluation"
          value={
            seller.ratingAverage > 0 ? seller.ratingAverage.toFixed(1) : "—"
          }
        />
      </div>

      <Link
        href={`/profile/${seller.username}`}
        className="mt-4 flex items-center justify-center gap-1 text-xs font-semibold text-[var(--gold)] hover:underline"
      >
        Voir le profil complet
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gold";
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] py-2.5 px-1">
      <div
        className={`text-base font-extrabold tabular-nums ${
          tone === "gold" ? "text-[var(--gold)]" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}
