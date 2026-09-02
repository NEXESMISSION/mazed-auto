/**
 * Build-time feature flags.
 *
 * Plain consts rather than env vars: these gate whole product surfaces, so
 * flipping one is a reviewed code change + deploy, not a dashboard toggle
 * someone can trip by accident. They are statically analysable, which also
 * lets the bundler drop the dead branches.
 */

/**
 * The v2 auction surfaces — the live ticker, the bid rails, the "enchères en
 * cours" blocks, the explore grid, and every entry point that leads to them.
 *
 * OFF. The platform sells fixed-price annonces now (PIVOT-PLAN.md), auctions
 * cannot be created (migration 0152), and a home page still shouting "Enchères
 * en cours" is the loudest way to tell a visitor they are looking at the old
 * product.
 *
 * The 60 lots still running are NOT broken by this: /auctions/<id> keeps
 * working for anyone holding a link, and the admin console keeps its v2 group,
 * so a live lot can still be watched, bid on and settled. What goes is every
 * place the app INVITES someone into an auction.
 *
 * This is the last flag of the pivot. KYC_ENABLED and INSPECTIONS_ENABLED are
 * gone because the code behind them is gone — a flag guarding deleted code is
 * just a lie about what the product can do. This one stays until the final lot
 * settles (latest end: 2026-09-11), then the auction code follows.
 */
export const AUCTIONS_VISIBLE = false;
