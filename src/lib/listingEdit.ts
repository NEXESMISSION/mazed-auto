/**
 * Editing a live annonce (« Modifier », /api/annonces/[id]/edit): the price
 * and how it is shown change at once; anything else goes back to review.
 */

/** A price above this is a typo — 100 million TND. */
export const MAX_PRICE = 100_000_000;
