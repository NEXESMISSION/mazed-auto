// Which notification kinds also go out as SMS — the single source of truth for
// the SMS drain (/api/cron/notify-sms). Kept in its own pure module (no server
// deps) so it can be unit-tested: see sms-kinds.test.ts, which guards the
// invariants that matter (admin kinds never SMS, the money/outcome-critical
// kinds are always present, broadcasts/high-frequency pings stay out).

// SMS the full user lifecycle — every step a user would want to hear about even
// when not on the site (good news + bad). DELIBERATELY EXCLUDED: high-frequency
// per-bid pings (bid_placed, watched_new_bid, seller_received_bid,
// seller_sixth_offer_received, sixth_offer_placed) — they'd spam; the `welcome`
// kind (the signup OTP SMS already reached them); admin-queue alerts (admin_*,
// the operator dashboard's job); and broadcasts (announcement/promo/maintenance/
// system_alert — a mass campaign is a deliberate action, not a per-user step);
// and on-site ACKNOWLEDGEMENTS of an action the user just performed on the site
// (payment_receipt_received, listing_submitted, inspector_application_received) —
// each is shortly followed by a real verdict (accepted / approved / rejected), so
// SMSing the ack too made the user get TWO SMS for one thing. Acks stay in-app +
// email; SMS carries the verdict only.
// The per-user daily cap (CAPPED_KINDS) still bounds an outbid storm.
export const SMS_KINDS = new Set<string>([
  // ── v3: the annonce lifecycle ──────────────────────────────────────────
  // A seller is not sitting on the site waiting. These four are the moments
  // where something happened TO their listing and they can do something about
  // it — the whole reason SMS exists here.
  "listing_published",          // it is live
  "listing_rejected",           // it needs a fix, with the reason
  "listing_expiring",           // J-3: renew or lose the visibility
  "listing_expired",            // it came down
  "listing_payment_received",   // the fee landed, it moved to review

  // Forfaits & badge — money and status, both worth a text.
  "credits_granted",
  "credits_expired",
  "badge_granted",
  "badge_expiring",
  "badge_revoked",

  // Payments (buyer/seller) — verdicts only. "payment_receipt_received" stays
  // an on-site acknowledgement: it is always followed by a real verdict, and
  // texting both meant two SMS for one thing.
  "payment_accepted",
  "payment_rejected",

  // ── v2 auctions: kept only while lots are still running ────────────────
  // Auction creation is frozen (0152) and every entry point is hidden
  // (AUCTIONS_VISIBLE), but 60 lots still close, still have winners, and those
  // people must still be told. Phase 6 deletes this block with the rest.
  "auction_won", "auction_lost", "auction_ending_soon",
  "outbid", "auction_outbid",
  "auction_sold_seller", "auction_finalized_seller",
  "final_payment_due_soon", "final_payment_due_tomorrow",
  "final_payment_overdue", "final_payment_defaulted",
  "deposit_refunded",
]);

// DELIBERATELY NOT SMS-ABLE, and why:
//   listing_submitted / payment_receipt_received  — on-site acknowledgements of
//     something the user JUST did; the verdict that follows carries the news.
//   admin_*                                       — the operator dashboard's job.
//   announcement / promo / maintenance            — a mass campaign is a
//     deliberate act, not a per-user lifecycle event.
//   sixth_offer_*, auction_live, reserve_not_met, kyc_*, inspection_*,
//   inspector_*, listing_unscheduled_reminder     — surfaces that no longer
//     exist in v3 (KYC removed, inspections gated, sixth-offer retired).

// The per-user daily cap applies ONLY to these higher-frequency kinds (so an
// "outbid storm" can't burn credit). Every other kind — the money/outcome/
// account-critical ones (won, payment/KYC/payout verdicts, final-payment,
// deposit refunded, …) — BYPASSES the cap and is never suppressed.
export const CAPPED_KINDS = new Set<string>([
  // High-frequency pings only. Everything else — a publication going live, a
  // refusal, a forfait credited — is a one-off the user must not miss.
  "outbid", "auction_outbid", "auction_ending_soon",
  "listing_expiring",
]);
