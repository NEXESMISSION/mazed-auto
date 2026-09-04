import { notificationHref, type NotificationPayload } from "./catalog";
/**
 * Single source of truth for "where does a notification go when tapped".
 *
 * Design:
 *  - The notification `kind` already encodes the recipient role
 *    (auction_won vs auction_sold_seller, *_seller, admin_*), so the
 *    destination is a pure function of kind (+ the entity id baked into
 *    the creator's `link`). No viewer-role guessing needed.
 *  - `link` is the canonical deep target. resolveNotificationLink trusts
 *    a valid link (after repairing legacy/broken paths), and only falls
 *    back to a per-kind hub when no link was set.
 *  - KIND_FALLBACK is an exhaustive Record over NOTIFICATION_KINDS typed
 *    to a closed set of real routes — so adding a kind without a target,
 *    or a typo'd route, is a COMPILE error. That's the guardrail that
 *    keeps broken notification links from ever shipping again.
 */

export const NOTIFICATION_KINDS = [
  // Auctions — buyer
  "bid_placed", "outbid", "watched_new_bid", "auction_won", "auction_lost", "auction_live",
  "auction_ending_soon", "auction_ended_unsold", "reserve_not_met",
  "buy_now_initiated", "sixth_offer_placed", "sixth_offer_outbid",
  "sixth_offer_awarded",
  "final_payment_due_soon", "final_payment_due_tomorrow", "final_payment_overdue",
  // Auctions — seller
  "seller_received_bid", "seller_sixth_offer_received", "auction_live_seller",
  "auction_sold_seller", "auction_finalized_seller", "auction_cancelled",
  "final_payment_overdue_seller",
  // Payments
  "payment_accepted", "payment_rejected", "payment_receipt_received",
  "deposit_refunded",
  // Listings (seller)
  "listing_submitted", "listing_published", "listing_approved",
  "listing_rejected", "listing_payment_rejected", "listing_expired",
  "listing_unscheduled_reminder",
  // Identity
  "kyc_verified", "kyc_rejected", "kyc_pending_reminder", "welcome",
  // Payouts (seller)
  "payout_processing", "payout_paid", "payout_rejected",
  // Inspections
  "inspection_requested", "inspection_assigned", "inspection_scheduled",
  "inspection_completed", "inspector_approved", "inspector_application_received",
  // Admin queues
  "admin_kyc_pending", "admin_receipt_pending", "admin_payout_pending",
  "admin_listing_pending", "admin_inspector_pending", "admin_final_payment_overdue",
  // Broadcasts
  "announcement", "promo", "maintenance", "system_alert",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Closed set of fallback destinations (no entity id). Every value here
 * must be a route that exists under src/app/[locale]/. `null` = stay
 * non-navigating. Widening this union without a real page is the only way
 * to introduce a dead fallback, so keep it honest.
 */

/**
 * Per-kind fallback used when the notification carries no usable link.
 * Exhaustive over NOTIFICATION_KINDS (compile-time guardrail).
 */

/** Last non-empty path segment, ignoring query/hash. */

/**
 * Repair links baked by notification creators that point at routes which
 * don't exist. Each maps to its closest real page. The /properties list
 * (with or without ?query) is left intact — only the non-existent
 * /properties/<id> detail route is rewritten.
 */
const KYC_SUBROUTES = new Set([
  "/kyc/start",
  "/kyc/status",
  "/kyc/processing",
  "/kyc/selfie",
  "/kyc/id-front",
  "/kyc/id-back",
]);

export function normalizeLink(link: string): string {
  if (link === "/account/payouts") return "/sell#payouts";
  // Real /kyc/<step> routes pass through; anything else (e.g. /kyc/<uuid>)
  // collapses to the entry page.
  if (link.startsWith("/kyc/")) {
    return KYC_SUBROUTES.has(link.split(/[?#]/)[0]) ? link : "/kyc";
  }
  if (link.startsWith("/properties/")) return "/sell";
  // There is no /sell/<id> detail page — only /sell/<id>/edit and
  // /sell/<id>/schedule exist. A bare or unknown /sell/<id> (baked by listing
  // approval / submission / cancellation notifications) would 404, so collapse
  // it to the seller dashboard while letting the real subroutes through.
  if (link.startsWith("/sell/")) {
    const sub = link.split(/[?#]/)[0].split("/")[3];
    return sub === "edit" || sub === "schedule" ? link : "/sell";
  }
  // /inspections/<id> has no public route — handled per-kind in resolve;
  // this is the catch-all for any that slip through to the explicit-link tier.
  if (link.startsWith("/inspections/")) return "/account/inspections";
  return link;
}

/** Kinds whose fallback hub is a list page that can scroll-to-row when
 *  a focus id is supplied. We append `?focus=<id>` only for these — other
 *  fallbacks (a wizard, the seller dashboard) don't have a row to find. */

/** Pull a string `focus` id out of the notification payload, if present.
 *  We never propagate non-string values — the only consumer is a query
 *  param the row-finder reads as a string. */

/**
 * Resolve the destination for a notification tap.
 *   1. Kind-first overrides — for kinds whose baked link is broken or
 *      points at the wrong audience (inspections, welcome). Owner-facing
 *      inspection updates deep-link to the specific inspection by lifting
 *      the id out of the /inspections/<id> link.
 *   2. A valid explicit link (entity-specific), repaired via normalizeLink.
 *   3. Per-kind hub fallback. Unknown kinds → null (non-navigating).
 *
 * If `payload.focus` is present AND the fallback hub supports row-focus
 * (FALLBACK_SUPPORTS_FOCUS), we append `?focus=<id>` so the list page can
 * scroll/ring the row this notification was about.
 */
export function resolveNotificationLink(
  kind: string,
  link: string | null,
  payload: Record<string, unknown> | null = null,
): string | null {
  // One resolver, one table. This used to be a 60-line switch that still knew
  // about inspections, KYC and auction outcomes — every one of those routes is
  // gone, so the switch was confidently sending people to 404s. The catalogue
  // owns the mapping now, and anything it does not recognise lands on the home
  // page instead of a dead URL.
  return notificationHref(kind, payload as NotificationPayload | null, link);
}
