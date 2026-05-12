// Server-side helpers for the subscription state of the current user.
// Reads the `user_active_subscription` view (one row per active sub) and
// the `user_listings_remaining` RPC (also enforces the free quota for
// non-subscribed users).

import { createClient } from "@/lib/supabase/server";

export interface ActiveSubscription {
  subscriptionId: string;
  planSlug: string;
  planName: string;
  listingsPerMonth: number;
  listingsRemaining: number;
  searchPriorityPct: number;
  featuredListingDiscountPct: number;
  hasTrustedSellerBadge: boolean;
  hasHomepagePlacement: boolean;
  hasBrandedShowroom: boolean;
  maxListingDurationDays: number;
  maxPhotos: number;
  maxVideoSeconds: number;
  maxConcurrentActiveListings: number;
  /** "basic" / "advanced" / "advanced_export" — drives the seller
   *  analytics page (Silver = basic, Gold = advanced, Diamond =
   *  advanced_export). */
  analyticsLevel: "basic" | "advanced" | "advanced_export";
  /** "none" / "standard" / "custom" / "branded" — drives the
   *  showroom layout / branding allowed for this seller. */
  showroomLevel: "none" | "standard" | "custom" | "branded";
  currentPeriodEnd: string;
  expiresAt: string | null;
  /** "active" = will auto-renew; "cancelled" = user cancelled,
   *  perks remain until expiresAt then drop. */
  status: "active" | "cancelled";
}

export async function getActiveSubscription(
  userId: string,
): Promise<ActiveSubscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_active_subscription")
    .select(
      "subscription_id, plan_slug, plan_name, listings_per_month, listings_remaining, search_priority_pct, featured_listing_discount_pct, has_trusted_seller_badge, has_homepage_placement, has_branded_showroom, max_listing_duration_days, max_photos, max_video_seconds, max_concurrent_active_listings, analytics_level, showroom_level, status, current_period_end, expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    subscriptionId: data.subscription_id,
    planSlug: data.plan_slug,
    planName: data.plan_name,
    listingsPerMonth: Number(data.listings_per_month),
    listingsRemaining: Number(data.listings_remaining),
    searchPriorityPct: Number(data.search_priority_pct),
    featuredListingDiscountPct: Number(
      data.featured_listing_discount_pct ?? 0,
    ),
    hasTrustedSellerBadge: Boolean(data.has_trusted_seller_badge),
    hasHomepagePlacement: Boolean(data.has_homepage_placement),
    hasBrandedShowroom: Boolean(data.has_branded_showroom),
    maxListingDurationDays: Number(data.max_listing_duration_days ?? 14),
    maxPhotos: Number(data.max_photos ?? 12),
    maxVideoSeconds: Number(data.max_video_seconds ?? 120),
    maxConcurrentActiveListings: Number(
      data.max_concurrent_active_listings ?? -1,
    ),
    analyticsLevel:
      data.analytics_level === "advanced"
        ? "advanced"
        : data.analytics_level === "advanced_export"
          ? "advanced_export"
          : "basic",
    showroomLevel:
      data.showroom_level === "branded"
        ? "branded"
        : data.showroom_level === "custom"
          ? "custom"
          : data.showroom_level === "none"
            ? "none"
            : "standard",
    currentPeriodEnd: data.current_period_end,
    expiresAt: data.expires_at,
    status:
      data.status === "cancelled" ? "cancelled" : "active",
  };
}

/** Public-safe plan perks for *any* user's listing. Used to render
 *  the trusted-seller badge and reveal the seller phone on auction
 *  detail pages. Returns null if the user isn't on an active plan. */
export interface SellerPublicPlanPerks {
  planSlug: string;
  planName: string;
  badgeTone: "silver" | "gold" | "diamond" | "custom";
  hasTrustedSellerBadge: boolean;
  hasHomepagePlacement: boolean;
  directPhoneVisible: boolean;
  searchPriorityPct: number;
}

export async function getSellerPublicPlanPerks(
  userId: string,
): Promise<SellerPublicPlanPerks | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("seller_public_plan_perks", { p_user_id: userId })
    .maybeSingle<{
      plan_slug: string;
      plan_name: string;
      badge_tone: string;
      has_trusted_seller_badge: boolean;
      has_homepage_placement: boolean;
      direct_phone_visible: boolean;
      search_priority_pct: number;
    }>();
  if (!data) return null;
  return {
    planSlug: data.plan_slug,
    planName: data.plan_name,
    badgeTone: data.badge_tone as SellerPublicPlanPerks["badgeTone"],
    hasTrustedSellerBadge: Boolean(data.has_trusted_seller_badge),
    hasHomepagePlacement: Boolean(data.has_homepage_placement),
    directPhoneVisible: Boolean(data.direct_phone_visible),
    searchPriorityPct: Number(data.search_priority_pct ?? 0),
  };
}

/** Batched version — returns a map from seller_id → search-priority
 *  perks. Used by /auctions ranking to boost Pro listings without
 *  N+1 queries. */
export interface SellerSearchPriority {
  searchPriorityPct: number;
  hasHomepagePlacement: boolean;
  hasTrustedSellerBadge: boolean;
}

export async function getSellerSearchPriorities(
  userIds: string[],
): Promise<Map<string, SellerSearchPriority>> {
  const out = new Map<string, SellerSearchPriority>();
  if (userIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.rpc("sellers_search_priority", {
    p_user_ids: userIds,
  });
  for (const r of (data ?? []) as Array<{
    user_id: string;
    search_priority_pct: number;
    has_homepage_placement: boolean;
    has_trusted_seller_badge: boolean;
  }>) {
    out.set(r.user_id, {
      searchPriorityPct: Number(r.search_priority_pct ?? 0),
      hasHomepagePlacement: Boolean(r.has_homepage_placement),
      hasTrustedSellerBadge: Boolean(r.has_trusted_seller_badge),
    });
  }
  return out;
}

/** Returns the seller's phone iff their active plan grants
 *  `direct_phone_visible`. The RPC self-gates, so this never leaks
 *  contact info for free-tier sellers. */
export async function getSellerPublicPhone(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("seller_public_phone", {
    p_user_id: userId,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function getListingsRemaining(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_listings_remaining", {
    p_user_id: userId,
  });
  if (typeof data !== "number") return 0;
  return data;
}
