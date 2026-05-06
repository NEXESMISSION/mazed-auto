import type { Auction, AIAlert } from "@/lib/types";

// PLAN §18 — heuristic AI alerts derived from auction signals. We generate
// them at read-time from the auction row instead of running a backend job
// because the signals are deterministic and cheap, and stale alerts on a row
// would be worse than no alerts at all.

export function computeAlerts(auction: Auction): AIAlert[] {
  const out: AIAlert[] = [];
  const v = auction.vehicle;
  const s = auction.seller;

  // New seller (account < 6 months OR < 3 successful deals OR low trust).
  // We use trustScore internally to decide whether to show the warning, but
  // we don't surface the score to users — only concrete signals (months,
  // deals) which are easier to interpret.
  const isNewSeller =
    s.accountAgeMonths < 6 || s.successfulDeals < 3 || s.trustScore < 80;
  if (isNewSeller && s.trustLevel !== "verified_pro") {
    out.push({
      type: "info",
      title: "Nouveau vendeur sur la plateforme",
      detail: `${s.successfulDeals} ventes précédentes · compte depuis ${s.accountAgeMonths} mois`,
      suggestion: "Consultez ses évaluations et vérifiez ses badges avant d'enchérir",
    });
  }

  // Reserve price set very high vs starting (often signals tire-kicker auction)
  if (
    auction.reservePrice &&
    auction.startingPrice &&
    auction.reservePrice > auction.startingPrice * 2
  ) {
    out.push({
      type: "info",
      title: "Prix de réserve élevé",
      detail:
        "Le vendeur demande un prix de réserve double du prix de départ. L'enchère pourrait ne pas atteindre la valeur de vente.",
    });
  }

  // (Removed the "KYC not verified" alert — the platform already blocks
  // unverified sellers from publishing in /seller/new/layout.tsx, and admin
  // review approves every listing. So if an auction is visible to bidders
  // here, the seller must be KYC-verified. The alert was a false positive
  // when the seller row's verified_kyc lagged behind auth.user_metadata.)

  // Photos missing or too few (spec requires 12)
  if (v.imageUrls.length < 8) {
    out.push({
      type: "info",
      title: `Peu de photos (${v.imageUrls.length})`,
      detail: "Les bonnes enchères comportent généralement 12 photos. Demandez des photos supplémentaires.",
    });
  }

  return out;
}
