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
