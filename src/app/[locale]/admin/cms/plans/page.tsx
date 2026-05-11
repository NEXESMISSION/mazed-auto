import { createClient } from "@/lib/supabase/server";
import { PlansEditor } from "./PlansEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsPlansPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_subscription_plans")
    .select(
      "slug, name_ar, name_fr, tagline_ar, tagline_fr, monthly_price, listings_per_month, search_priority_pct, featured_listing_discount_pct, has_trusted_seller_badge, has_homepage_placement, has_custom_reports, max_listing_duration_days, max_photos, max_video_seconds, max_concurrent_active_listings, auto_renew_listings, direct_phone_visible, bulk_import_enabled, analytics_level, showroom_level, support_level, features, badge_tone, is_visible, position",
    )
    .order("position", { ascending: true });
  return <PlansEditor initial={(data ?? []) as never[]} />;
}
