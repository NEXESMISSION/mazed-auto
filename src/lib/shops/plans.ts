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
  /** `products.name_ar`, when an admin wrote one. */
  nameAr: string | null;
  price: number;
  durationDays: number;
  limits: { vehicles: number; parts: number };
  description: string | null;
};

export async function plansForSale(admin: SupabaseClient): Promise<Plan[]> {
  const { data } = await admin
    .from("products")
    .select("id, plan_code, name_fr, name_ar, price, duration_days, limits, description")
    .eq("kind", "subscription")
    .eq("is_active", true)
    .not("plan_code", "is", null)
    .order("sort_order");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.plan_code as string,
    name: r.name_fr as string,
    nameAr: (r.name_ar as string | null) ?? null,
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

/** A plan's name in `locale`: `name_ar` on an Arabic page when there is one. */
export function planName(plan: Pick<Plan, "name" | "nameAr">, locale: string): string {
  return locale === "ar" && plan.nameAr ? plan.nameAr : plan.name;
}

/** The limit a plan gives a shop of this activity — the bucket of its activity, never the sum. */
export function planLimitFor(plan: Pick<Plan, "limits">, activity: string): { n: number; bucket: "parts" | "vehicles" } {
  return activity === "pieces_auto"
    ? { n: plan.limits.parts, bucket: "parts" }
    : { n: plan.limits.vehicles, bucket: "vehicles" };
}
