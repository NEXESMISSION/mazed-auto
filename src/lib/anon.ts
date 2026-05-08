// Stable anonymous handles for participants whose real identity must not
// leak across the marketplace. Buyers can't see who the seller is, sellers
// can't see who the bidders are — both sides show a per-user tag derived
// from the user_id so the same person reads as the same handle within an
// auction without exposing their name or username.

function tagFromId(userId: string | null | undefined, fallbackIdx?: number) {
  if (!userId) {
    return fallbackIdx !== undefined ? `${fallbackIdx + 1}` : "0000";
  }
  return userId.replace(/-/g, "").slice(-4).toUpperCase();
}

/** "Enchérisseur #A1B2" — used in bid history, seller dashboards, etc. */
export function anonBidder(
  userId: string | null | undefined,
  fallbackIdx?: number,
): string {
  return `Enchérisseur #${tagFromId(userId, fallbackIdx)}`;
}

/** "Vendeur #A1B2" — used on the public auction detail page. */
export function anonSeller(userId: string | null | undefined): string {
  return `Vendeur #${tagFromId(userId)}`;
}
