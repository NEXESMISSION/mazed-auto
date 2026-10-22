import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The plans and the boost as they are FOR SALE right now — read from
 * `products`, active rows only. Every page that shows a price reads it here,
 * and the checkout route reads the same rows: what is shown is what is charged.
 */
export type Plan = {
  id: string;
  code: string;
  name: string;
  price: number;
  durationDays: number;
  limits: { vehicles: number; parts: number };
  description: string | null;
};

export async function plansForSale(admin: SupabaseClient): Promise<Plan[]> {
  const { data } = await admin
    .from("products")
    .select("id, plan_code, name_fr, price, duration_days, limits, description")
    .eq("kind", "subscription")
    .eq("is_active", true)
    .not("plan_code", "is", null)
    .order("sort_order");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.plan_code as string,
    name: r.name_fr as string,
    price: Number(r.price),
    durationDays: Number(r.duration_days),
    limits: r.limits as { vehicles: number; parts: number },
    description: (r.description as string | null) ?? null,
  }));
}

export async function boostForSale(admin: SupabaseClient): Promise<{ id: string; price: number; days: number } | null> {
  const { data } = await admin
    .from("products")
    .select("id, price, duration_days")
    .eq("slug", "boost-7j")
    .eq("is_active", true)
    .maybeSingle();
  return data ? { id: data.id as string, price: Number(data.price), days: Number(data.duration_days) } : null;
}

/** The limit a plan gives a shop of this activity — the bucket of its activity, never the sum. */
export function planLimitFor(plan: Pick<Plan, "limits">, activity: string): { n: number; word: string } {
  return activity === "pieces_auto"
    ? { n: plan.limits.parts, word: "pièces" }
    : { n: plan.limits.vehicles, word: "véhicules" };
}
