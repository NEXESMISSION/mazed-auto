import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pro approvals (0196, decisions D-A1…D-A6): what a shop buys may need an
 * admin's yes first. The database is the authority — it says what kind a
 * purchase is (`pro_request_kind`), whether that kind needs an approval
 * (`pro_approval_required`), and it refuses a payment row that skips one.
 * This file only reads what the pages show.
 */

export type RequestKind = "opening" | "plan_change" | "renewal" | "boost";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";

export const REQUEST_KINDS: RequestKind[] = ["opening", "plan_change", "renewal", "boost"];

/** `app_settings.pro_approvals`, and the defaults the database falls back to. */
export type Approvals = Record<RequestKind, boolean>;
export const DEFAULT_APPROVALS: Approvals = { opening: true, plan_change: true, renewal: false, boost: false };

export function readApprovals(value: unknown): Approvals {
  const v = (value ?? {}) as Partial<Record<RequestKind, unknown>>;
  return Object.fromEntries(
    REQUEST_KINDS.map((k) => [k, typeof v[k] === "boolean" ? v[k] : DEFAULT_APPROVALS[k]]),
  ) as Approvals;
}

export async function approvalsSetting(admin: SupabaseClient): Promise<Approvals> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "pro_approvals").maybeSingle();
  return readApprovals(data?.value);
}

/**
 * The kind a plan purchase would be for a shop, from its periods (newest
 * first): none yet is its opening, the same plan again a renewal, another
 * plan a change. The same rule as `pro_request_kind`, for labelling buttons.
 */
export function planKind(latestPlanCode: string | null | undefined, hadPeriod: boolean, planCode: string): RequestKind {
  if (!hadPeriod) return "opening";
  return latestPlanCode === planCode ? "renewal" : "plan_change";
}

export type ProRequest = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  listingId: string | null;
  listingTitle: string | null;
  product: { id: string; name: string; nameAr: string | null; price: number; planCode: string | null };
};

const SELECT =
  "id, kind, status, reason, created_at, decided_at, listing_id, listing:listings (title), product:products (id, name_fr, name_ar, price, plan_code)";

type Row = {
  id: string; kind: RequestKind; status: RequestStatus; reason: string | null;
  created_at: string; decided_at: string | null; listing_id: string | null;
  listing: { title: string } | { title: string }[] | null;
  product: ProductRow | ProductRow[] | null;
};
type ProductRow = { id: string; name_fr: string; name_ar: string | null; price: number | string; plan_code: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function toRequest(r: Row): ProRequest {
  const p = one(r.product);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    listingId: r.listing_id,
    listingTitle: one(r.listing)?.title ?? null,
    product: {
      id: p?.id ?? "",
      name: p?.name_fr ?? "—",
      nameAr: p?.name_ar ?? null,
      price: Number(p?.price ?? 0),
      planCode: p?.plan_code ?? null,
    },
  };
}

/**
 * What the shop has asked for lately: every open request (one for a plan at
 * most, plus open boosts), then the latest closed one when it was a decision
 * the seller should read — a refusal, or an approval taken back.
 */
export async function shopRequests(
  admin: SupabaseClient,
  shopId: string,
): Promise<{ open: ProRequest[]; lastDecision: ProRequest | null }> {
  const { data } = await admin
    .from("pro_requests")
    .select(SELECT)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = ((data ?? []) as unknown as Row[]).map(toRequest);
  const open = rows.filter((r) => r.status === "pending" || r.status === "approved");
  const closedPlan = rows.find((r) => r.kind !== "boost" && !open.includes(r));
  const newerOpenPlan = open.some((r) => r.kind !== "boost");
  const lastDecision =
    !newerOpenPlan && closedPlan && (closedPlan.status === "rejected" || (closedPlan.status === "cancelled" && closedPlan.reason))
      ? closedPlan
      : null;
  return { open, lastDecision };
}

/** A product's name in `locale`: `name_ar` on an Arabic page when there is one. */
export function requestProductName(r: Pick<ProRequest, "product">, locale: string): string {
  return locale === "ar" && r.product.nameAr ? r.product.nameAr : r.product.name;
}

/**
 * An admin's reason as typed — often French inside an Arabic sentence. Wrapped
 * in Unicode isolates (FSI … PDI) so it keeps its own direction: without them
 * its closing full stop lands at the wrong end of the line.
 */
export const isolated = (text: string) => `⁨${text}⁩`;
