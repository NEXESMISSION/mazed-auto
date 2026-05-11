/**
 * CMS read helpers — used by public pages to render content edited
 * via /admin/cms/*. Lookups go straight to Supabase; the public RLS
 * policies expose only published rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CmsPage {
  slug: string;
  titleAr: string | null;
  titleFr: string | null;
  bodyAr: string | null;
  bodyFr: string | null;
}

export interface CmsFaq {
  id: string;
  position: number;
  questionAr: string | null;
  questionFr: string;
  answerAr: string | null;
  answerFr: string;
}

export interface CmsBanner {
  id: string;
  titleAr: string | null;
  titleFr: string | null;
  subtitleAr: string | null;
  subtitleFr: string | null;
  ctaLabelAr: string | null;
  ctaLabelFr: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
  position: number;
}

export interface CmsBrand {
  slug: string;
  displayName: string;
  logoUrl: string | null;
  position: number;
}

export interface CmsFeature {
  slug: string;
  labelAr: string | null;
  labelFr: string;
  category: string | null;
  position: number;
}

export interface CmsCity {
  slug: string;
  nameAr: string | null;
  nameFr: string;
  region: string | null;
  position: number;
}

export interface CmsCategory {
  slug: string;
  nameAr: string | null;
  nameFr: string;
  imageUrl: string | null;
  position: number;
}

export type PlanAnalyticsLevel = "basic" | "advanced" | "advanced_export";
export type PlanShowroomLevel = "none" | "standard" | "custom" | "branded";
export type PlanSupportLevel = "email" | "chat" | "dedicated";
export type PlanBadgeTone = "silver" | "gold" | "diamond" | "custom";

export interface CmsPlan {
  slug: string;
  nameAr: string | null;
  nameFr: string;
  taglineAr: string | null;
  taglineFr: string | null;
  monthlyPrice: number;
  listingsPerMonth: number; // -1 = unlimited
  searchPriorityPct: number;
  featuredListingDiscountPct: number;
  hasTrustedSellerBadge: boolean;
  hasHomepagePlacement: boolean;
  hasCustomReports: boolean;
  maxListingDurationDays: number;
  maxPhotos: number;
  maxVideoSeconds: number;
  maxConcurrentActiveListings: number; // -1 = unlimited
  autoRenewListings: boolean;
  directPhoneVisible: boolean;
  bulkImportEnabled: boolean;
  analyticsLevel: PlanAnalyticsLevel;
  showroomLevel: PlanShowroomLevel;
  supportLevel: PlanSupportLevel;
  features: string[];
  /** Arabic feature bullets — falls back to `features` if empty. */
  featuresAr: string[];
  badgeTone: PlanBadgeTone;
  position: number;
}

export async function getCmsPage(
  supabase: SupabaseClient,
  slug: string,
): Promise<CmsPage | null> {
  const { data } = await supabase
    .from("cms_pages")
    .select("slug, title_ar, title_fr, body_ar, body_fr")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug,
    titleAr: data.title_ar,
    titleFr: data.title_fr,
    bodyAr: data.body_ar,
    bodyFr: data.body_fr,
  };
}

export async function listCmsFaqs(
  supabase: SupabaseClient,
): Promise<CmsFaq[]> {
  const { data } = await supabase
    .from("cms_faqs")
    .select("id, position, question_ar, question_fr, answer_ar, answer_fr")
    .eq("is_published", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    position: r.position,
    questionAr: r.question_ar,
    questionFr: r.question_fr,
    answerAr: r.answer_ar,
    answerFr: r.answer_fr,
  }));
}

export async function listCmsBanners(
  supabase: SupabaseClient,
): Promise<CmsBanner[]> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("cms_promo_banners")
    .select(
      "id, title_ar, title_fr, subtitle_ar, subtitle_fr, cta_label_ar, cta_label_fr, cta_href, image_url, starts_at, ends_at, is_active, position",
    )
    .eq("is_active", true)
    .order("position", { ascending: true });
  return (data ?? [])
    .filter(
      (r) =>
        (!r.starts_at || r.starts_at <= nowIso) &&
        (!r.ends_at || r.ends_at > nowIso),
    )
    .map((r) => ({
      id: r.id,
      titleAr: r.title_ar,
      titleFr: r.title_fr,
      subtitleAr: r.subtitle_ar,
      subtitleFr: r.subtitle_fr,
      ctaLabelAr: r.cta_label_ar,
      ctaLabelFr: r.cta_label_fr,
      ctaHref: r.cta_href,
      imageUrl: r.image_url,
      position: r.position,
    }));
}

export async function listCmsBrands(
  supabase: SupabaseClient,
): Promise<CmsBrand[]> {
  const { data } = await supabase
    .from("cms_brands")
    .select("slug, display_name, logo_url, position")
    .eq("is_active", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => ({
    slug: r.slug,
    displayName: r.display_name,
    logoUrl: r.logo_url,
    position: r.position,
  }));
}

export async function listCmsFeatures(
  supabase: SupabaseClient,
): Promise<CmsFeature[]> {
  const { data } = await supabase
    .from("cms_features")
    .select("slug, label_ar, label_fr, category, position")
    .eq("is_active", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => ({
    slug: r.slug,
    labelAr: r.label_ar,
    labelFr: r.label_fr,
    category: r.category,
    position: r.position,
  }));
}

export async function listCmsCities(
  supabase: SupabaseClient,
): Promise<CmsCity[]> {
  const { data } = await supabase
    .from("cms_cities")
    .select("slug, name_ar, name_fr, region, position")
    .eq("is_active", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => ({
    slug: r.slug,
    nameAr: r.name_ar,
    nameFr: r.name_fr,
    region: r.region,
    position: r.position,
  }));
}

export async function listCmsCategories(
  supabase: SupabaseClient,
): Promise<CmsCategory[]> {
  const { data } = await supabase
    .from("cms_categories")
    .select("slug, name_ar, name_fr, image_url, position")
    .eq("is_visible", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => ({
    slug: r.slug,
    nameAr: r.name_ar,
    nameFr: r.name_fr,
    imageUrl: r.image_url,
    position: r.position,
  }));
}

const PLAN_COLUMNS =
  "slug, name_ar, name_fr, tagline_ar, tagline_fr, monthly_price, listings_per_month, search_priority_pct, featured_listing_discount_pct, has_trusted_seller_badge, has_homepage_placement, has_custom_reports, max_listing_duration_days, max_photos, max_video_seconds, max_concurrent_active_listings, auto_renew_listings, direct_phone_visible, bulk_import_enabled, analytics_level, showroom_level, support_level, features, features_ar, badge_tone, position";

function rowToPlan(r: Record<string, unknown>): CmsPlan {
  return {
    slug: r.slug as string,
    nameAr: (r.name_ar as string | null) ?? null,
    nameFr: r.name_fr as string,
    taglineAr: (r.tagline_ar as string | null) ?? null,
    taglineFr: (r.tagline_fr as string | null) ?? null,
    monthlyPrice: Number(r.monthly_price),
    listingsPerMonth: Number(r.listings_per_month),
    searchPriorityPct: Number(r.search_priority_pct),
    featuredListingDiscountPct: Number(r.featured_listing_discount_pct ?? 0),
    hasTrustedSellerBadge: Boolean(r.has_trusted_seller_badge),
    hasHomepagePlacement: Boolean(r.has_homepage_placement),
    hasCustomReports: Boolean(r.has_custom_reports),
    maxListingDurationDays: Number(r.max_listing_duration_days ?? 14),
    maxPhotos: Number(r.max_photos ?? 12),
    maxVideoSeconds: Number(r.max_video_seconds ?? 120),
    maxConcurrentActiveListings: Number(r.max_concurrent_active_listings ?? -1),
    autoRenewListings: Boolean(r.auto_renew_listings),
    directPhoneVisible: Boolean(r.direct_phone_visible),
    bulkImportEnabled: Boolean(r.bulk_import_enabled),
    analyticsLevel: ((r.analytics_level as string) ??
      "basic") as PlanAnalyticsLevel,
    showroomLevel: ((r.showroom_level as string) ??
      "standard") as PlanShowroomLevel,
    supportLevel: r.support_level as PlanSupportLevel,
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    featuresAr: Array.isArray(r.features_ar) ? (r.features_ar as string[]) : [],
    badgeTone: r.badge_tone as PlanBadgeTone,
    position: Number(r.position),
  };
}

export async function listCmsPlans(
  supabase: SupabaseClient,
): Promise<CmsPlan[]> {
  const { data } = await supabase
    .from("cms_subscription_plans")
    .select(PLAN_COLUMNS)
    .eq("is_visible", true)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => rowToPlan(r as Record<string, unknown>));
}

export function pickLocaleText<
  T extends { titleAr?: string | null; titleFr?: string | null },
>(row: T, locale: string, key: "title" | "body" | "subtitle" | "ctaLabel" | "answer" | "question" | "name" | "label"): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  const ar = r[`${key}Ar`];
  const fr = r[`${key}Fr`];
  if (locale === "ar") return ar ?? fr ?? "";
  return fr ?? ar ?? "";
}
