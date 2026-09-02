/**
 * Build-time feature flags.
 *
 * Plain consts rather than env vars: these gate whole product surfaces, so
 * flipping one is a reviewed code change + deploy, not a dashboard toggle
 * someone can trip by accident. They are statically analysable, which also
 * lets the bundler drop the dead branches.
 */

/**
 * Inspections / the third-party inspector network — booking an inspection,
 * applying to become an inspector, the inspector workspace, the admin
 * approval queue, and the report download.
 *
 * OFF for launch. Everything is handled directly by us at first, so there
 * is no external inspector network for a user to book from or apply to, and
 * a visible-but-empty surface reads as broken. The code is intact and gated
 * rather than deleted so this can be turned back on in one line.
 *
 * Turning it on again: flip to `true`. The gates are
 *   - middleware.ts        → blocks /inspector, /inspectors/*,
 *                            /account/inspections/*, /admin/inspectors
 *   - api/inspector/report/[id]              → 404s while off
 *   - api/admin/inspectors/[id]/approve      → 404s while off
 *   - the nav / account / auction / home entry points that link to them
 */
export const INSPECTIONS_ENABLED = false;

/**
 * KYC — CIN capture, selfie liveness, the review queue, and every gate that
 * asked "is this user verified?".
 *
 * OFF, and on its way out for good (see PIVOT-PLAN.md §2.1). v3 is a paid
 * classifieds marketplace: we never hold the money for a sale, so a verified
 * identity buys us nothing, while storing CIN images and selfies of Tunisian
 * citizens is the heaviest liability in the system. Identity is now: a verified
 * phone, moderation of every listing, the per-listing seller attestation, and
 * the paid "Vendeur vérifié" badge an admin grants by hand.
 *
 * While this is false:
 *   - middleware.ts bounces /kyc/* and /admin/kyc-queue
 *   - the account row, the home step and the nudge modal disappear
 *   - every "kycVerified" gate reads TRUE, so the 60 auctions still running
 *     stay biddable for people who never verified
 *
 * It is a flag rather than a deletion for exactly one release: Phase 6 deletes
 * the ~3 640 lines behind it, drops kyc_submissions, and purges the bucket.
 */
export const KYC_ENABLED = false;
