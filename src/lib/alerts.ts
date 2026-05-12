import type { Auction, AIAlert } from "@/lib/types";

/**
 * Heuristic auto-generated alerts (was PLAN §18).
 *
 * Disabled deliberately: the rule-based alerts ("Nouveau vendeur sur
 * la plateforme", "Prix de réserve élevé", etc.) added noise that
 * couldn't be tuned per-listing and showed up everywhere even when
 * irrelevant. The plan is to replace this with admin-managed alert
 * rules — created from the admin dashboard with explicit conditions
 * (status / brand / seller filters, custom message, severity) — so
 * the platform owner controls exactly what users see.
 *
 * The pipeline still merges DB-stored alerts (the `auctions.alerts`
 * jsonb column) over whatever this returns, so admin-created rules
 * land via that path. Until the admin UI ships, manually inserted
 * rows in that column also work.
 */
 
export function computeAlerts(_auction: Auction): AIAlert[] {
  return [];
}
