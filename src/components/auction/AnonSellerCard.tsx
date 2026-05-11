import { ShieldCheck, Star, MapPin, Crown, Phone } from "lucide-react";
import type { Seller } from "@/lib/types";
import { anonSeller } from "@/lib/anon";

export interface SellerPlanPerks {
  planSlug: string;
  planName: string;
  badgeTone: "silver" | "gold" | "diamond" | "custom";
  hasTrustedSellerBadge: boolean;
  hasHomepagePlacement: boolean;
  directPhoneVisible: boolean;
}

interface Props {
  seller: Seller;
  /** Public-safe plan info for this seller, fetched server-side via
   *  the `seller_public_plan_perks(uuid)` RPC. `null` if the seller
   *  isn't on a Pro plan. */
  planPerks?: SellerPlanPerks | null;
  /** Seller's verified phone number, shown only when the plan grants
   *  `direct_phone_visible`. Caller must gate this themselves. */
  sellerPhone?: string | null;
}

/**
 * Buyer-facing seller block. Shows trust signals (KYC, rating, deals,
 * city) but never the seller's name, username, or profile link — buyers
 * cannot identify the seller. Anonymous handle is derived from the seller
 * id so the same vendor reads as the same tag across their auctions.
 *
 * Pro plan perks: trusted-seller badge appears next to the handle if
 * the plan grants it, and the verified phone is revealed under the
 * stats row if `directPhoneVisible` is true.
 */
export function AnonSellerCard({ seller, planPerks, sellerPhone }: Props) {
  const handle = anonSeller(seller.id);
  const showBadge = Boolean(planPerks?.hasTrustedSellerBadge);
  const showPhone =
    Boolean(planPerks?.directPhoneVisible) && Boolean(sellerPhone);

  const badgeClass =
    planPerks?.badgeTone === "diamond"
      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
      : planPerks?.badgeTone === "gold"
        ? "bg-[var(--gold-faint)] text-[var(--gold-bright)] border-[var(--gold)]/30"
        : "bg-slate-500/15 text-slate-300 border-slate-500/30";

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
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-bold text-sm truncate">{handle}</span>
          {seller.verifiedKyc && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--gold)]">
              Vérifié
            </span>
          )}
          {showBadge && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-extrabold uppercase tracking-[0.12em] ${badgeClass}`}
              title={`Vendeur de confiance — Plan ${planPerks?.planName ?? ""}`}
            >
              <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
              Vendeur de confiance
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
        {showPhone && (
          <a
            href={`tel:${sellerPhone}`}
            className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-[var(--gold-bright)] hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            {sellerPhone}
          </a>
        )}
      </div>
    </div>
  );
}
