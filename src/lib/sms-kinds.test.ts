import { describe, it, expect } from "vitest";
import { SMS_KINDS, CAPPED_KINDS } from "./sms-kinds";

// These guard the SMS-eligibility list against the two ways it silently breaks:
// (1) an admin/queue/broadcast kind leaking in (the user gets operator spam, or
// we burn SMS credit on a mass campaign), and (2) a money/outcome-critical kind
// getting dropped (a buyer never hears they won / must pay / were refunded).
describe("SMS_KINDS", () => {
  it("never SMSes admin/operator kinds", () => {
    const admin = [...SMS_KINDS].filter((k) => k.startsWith("admin_"));
    expect(admin).toEqual([]);
  });

  it("excludes high-frequency pings and broadcasts (would spam / cost)", () => {
    // Per-bid pings, the welcome OTP echo, and mass-campaign kinds must stay out
    // — sending these as SMS would flood users and drain credit.
    const mustNotSms = [
      "bid_placed", "watched_new_bid", "seller_received_bid",
      "seller_sixth_offer_received", "sixth_offer_placed", "welcome",
      "announcement", "promo", "maintenance", "system_alert",
      // on-site acknowledgements — each is followed by a real verdict SMS, so
      // SMSing the ack too = two SMS for one thing. Kept in-app + email only.
      "payment_receipt_received", "listing_submitted", "inspector_application_received",
    ];
    for (const k of mustNotSms) expect(SMS_KINDS.has(k)).toBe(false);
  });

  it("always SMSes the money / outcome-critical kinds", () => {
    // A regression tripwire: if anyone removes one of these from the list, a
    // user stops getting an SMS for something they must act on quickly.
    //
    // Rewritten for v3. The old list guarded kyc_*, payout_* and
    // sixth_offer_awarded — surfaces the pivot removed, so guarding them here
    // was asserting that a deleted feature still texts people. What replaces
    // them is the annonce lifecycle: a seller who is not on the site needs to
    // hear that their listing went live, was refused, or is about to expire.
    const mustSms = [
      // v3 — the annonce and what was paid for it
      "listing_published", "listing_rejected", "listing_expiring", "listing_expired",
      "listing_payment_received",
      "credits_granted", "credits_expired",
      "badge_granted", "badge_revoked",
      "payment_accepted", "payment_rejected",
      // v2 — still true while the last lots close (deleted in Phase 6)
      "auction_won", "auction_lost", "auction_sold_seller",
      "final_payment_due_soon", "final_payment_overdue", "final_payment_defaulted",
      "deposit_refunded",
    ];
    for (const k of mustSms) expect(SMS_KINDS.has(k)).toBe(true);
  });

  it("does not SMS surfaces the v3 pivot removed", () => {
    // KYC is deleted (PIVOT-PLAN.md §2.1), payouts went with the escrow model,
    // and the sixth-offer window is retired. Texting about any of them would
    // point a user at a screen that no longer exists.
    const gone = [
      "kyc_verified", "kyc_rejected", "kyc_pending_reminder",
      "payout_paid", "payout_rejected", "payout_processing",
      "sixth_offer_awarded", "sixth_offer_outbid",
      "inspection_completed", "inspector_approved",
    ];
    for (const k of gone) expect(SMS_KINDS.has(k)).toBe(false);
  });

  it("only caps kinds that are actually SMS-eligible", () => {
    // A capped kind that isn't in SMS_KINDS is dead config (likely a typo) — the
    // cap would never fire for it. CAPPED_KINDS must be a subset of SMS_KINDS.
    const orphans = [...CAPPED_KINDS].filter((k) => !SMS_KINDS.has(k));
    expect(orphans).toEqual([]);
  });

  it("never caps a money/outcome-critical kind (those must never be suppressed)", () => {
    // The cap is only allowed to throttle high-frequency noise. If a critical
    // kind ever ends up capped, an outbid storm could swallow a "you won" SMS.
    const critical = [
      "listing_published", "listing_rejected", "listing_payment_received",
      "credits_granted", "badge_granted", "badge_revoked",
      "auction_won", "auction_lost", "payment_accepted",
      "payment_rejected", "deposit_refunded",
      "final_payment_due_soon", "final_payment_overdue",
    ];
    for (const k of critical) expect(CAPPED_KINDS.has(k)).toBe(false);
  });
});
