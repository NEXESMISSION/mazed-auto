import { ShieldCheck, Star, MapPin } from "lucide-react";
import type { Seller } from "@/lib/types";
import { anonSeller } from "@/lib/anon";

interface Props {
  seller: Seller;
}

/**
 * Buyer-facing seller block. Shows trust signals (KYC, rating, deals,
 * city) but never the seller's name, username, or profile link — buyers
 * cannot identify the seller. Anonymous handle is derived from the seller
 * id so the same vendor reads as the same tag across their auctions.
 */
export function AnonSellerCard({ seller }: Props) {
  const handle = anonSeller(seller.id);
  return (
    <div className="flex items-center gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
      <div className="h-11 w-11 shrink-0 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
        <ShieldCheck
          className={`h-5 w-5 ${
            seller.verifiedKyc
              ? "text-[var(--gold)]"
              : "text-[var(--foreground-subtle)]"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm truncate">{handle}</span>
          {seller.verifiedKyc && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--gold)]">
              Vérifié
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--foreground-muted)]">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            {seller.ratingAverage > 0
              ? seller.ratingAverage.toFixed(1)
              : "—"}
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
              {seller.successfulDeals}{" "}
              {seller.successfulDeals === 1 ? "vente" : "ventes"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
