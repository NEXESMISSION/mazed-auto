import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A shop's one subscription (0198): what a plan button means for it, what it
 * would cost, and what the database refuses. The rules and the prices live in
 * the database (`subscription_quote`, `create_subscription_order`,
 * `shop_subscription_change`); this file only names them for the routes and
 * the dashboard.
 *
 *   subscribe  no live subscription yet: a period from now, full price
 *   renew      the next period — same plan, or the scheduled lower one — in
 *              the last 7 days or during grace; full price
 *   upgrade    a higher plan now, for the prorated difference; the renewal
 *              date stays
 *   downgrade / cancel are not purchases: they are scheduled for the renewal
 */
export const INTENTS = ["subscribe", "renew", "upgrade"] as const;
export type Intent = (typeof INTENTS)[number];

export const SCHEDULE_ACTIONS = ["cancel", "resume", "downgrade", "undo_downgrade"] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/** What `subscription_quote` answers: the price and dates, or why not. */
export type Quote = {
  error?: string;
  intent?: Intent;
  amount?: number;
  price?: number;
  from_price?: number;
  plan_code?: string;
  from_plan_code?: string;
  effective_at?: string;
  ends_at?: string;
  renews_at?: string;
  opens_at?: string;
  takes_downgrade?: boolean;
  withdraws_downgrade?: boolean;
  keeps_cancel?: boolean;
};

/** Every refusal the database can give, each with its sentence under `pro.api.subscription`. */
export const SUBSCRIPTION_ERRORS = [
  "subscription_exists", "no_subscription", "subscription_cancelled", "renewal_already_paid",
  "renewal_not_open", "renewal_plan_mismatch", "no_current_period", "next_period_paid", "not_an_upgrade",
  "not_a_downgrade", "renew_instead", "order_open", "upgrade_period_over", "upgrade_stale", "not_for_sale",
  "plan_change_not_allowed", "bad_intent",
] as const;

/** The refusal named in a database error message, if it is one of ours. */
export function subscriptionError(message: string | undefined | null): (typeof SUBSCRIPTION_ERRORS)[number] | null {
  if (!message) return null;
  return SUBSCRIPTION_ERRORS.find((e) => message.includes(e)) ?? null;
}

export async function quoteFor(admin: SupabaseClient, shopId: string, productId: string, intent: Intent): Promise<Quote> {
  const { data, error } = await admin.rpc("subscription_quote", { p_shop: shopId, p_product: productId, p_intent: intent });
  if (error) return { error: subscriptionError(error.message) ?? "bad_intent" };
  return (data ?? { error: "bad_intent" }) as Quote;
}

/**
 * The intent of a plan button. The dashboard says it; an older caller that
 * does not (the shop creation wizard, the annonces page) gets the only one
 * that can apply: subscribe without a subscription, upgrade to a higher plan,
 * renew otherwise — and the database says no when none fits.
 */
export async function resolveIntent(
  admin: SupabaseClient,
  shopId: string,
  productId: string,
  asked: unknown,
): Promise<Intent> {
  if (INTENTS.includes(asked as Intent)) return asked as Intent;
  if (!(await quoteFor(admin, shopId, productId, "subscribe")).error) return "subscribe";
  if (!(await quoteFor(admin, shopId, productId, "upgrade")).error) return "upgrade";
  return "renew";
}
