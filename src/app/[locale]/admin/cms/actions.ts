"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin";

type Result = { ok: true } | { ok: false; error: string };

async function ensureAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "AUTH_REQUIRED" };
  const role = getAdminRole(user);
  if (!role) return { ok: false as const, error: "NOT_ADMIN" };
  return { ok: true as const, supabase, userId: user.id };
}

// ---- CMS pages (about / help / terms / privacy / how-it-works) ----

export async function upsertCmsPage(input: {
  slug: string;
  titleAr?: string | null;
  titleFr?: string | null;
  bodyAr?: string | null;
  bodyFr?: string | null;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase.from("cms_pages").upsert({
    slug: input.slug,
    title_ar: input.titleAr ?? null,
    title_fr: input.titleFr ?? null,
    body_ar: input.bodyAr ?? null,
    body_fr: input.bodyFr ?? null,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/${input.slug}`, "page");
  revalidatePath(`/[locale]/admin/cms/pages`, "page");
  return { ok: true };
}

// ---- FAQs ----

export async function upsertFaq(input: {
  id?: string;
  position: number;
  questionAr?: string | null;
  questionFr: string;
  answerAr?: string | null;
  answerFr: string;
  isPublished: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    position: input.position,
    question_ar: input.questionAr ?? null,
    question_fr: input.questionFr,
    answer_ar: input.answerAr ?? null,
    answer_fr: input.answerFr,
    is_published: input.isPublished,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await g.supabase
        .from("cms_faqs")
        .update(payload)
        .eq("id", input.id)
    : await g.supabase.from("cms_faqs").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/help`, "page");
  revalidatePath(`/[locale]/admin/cms/faqs`, "page");
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase.from("cms_faqs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/help`, "page");
  revalidatePath(`/[locale]/admin/cms/faqs`, "page");
  return { ok: true };
}

// ---- Promo banners ----

export async function upsertBanner(input: {
  id?: string;
  titleAr?: string | null;
  titleFr?: string | null;
  subtitleAr?: string | null;
  subtitleFr?: string | null;
  ctaLabelAr?: string | null;
  ctaLabelFr?: string | null;
  ctaHref?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  position: number;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    title_ar: input.titleAr ?? null,
    title_fr: input.titleFr ?? null,
    subtitle_ar: input.subtitleAr ?? null,
    subtitle_fr: input.subtitleFr ?? null,
    cta_label_ar: input.ctaLabelAr ?? null,
    cta_label_fr: input.ctaLabelFr ?? null,
    cta_href: input.ctaHref ?? null,
    image_url: input.imageUrl ?? null,
    is_active: input.isActive,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    position: input.position,
  };
  const { error } = input.id
    ? await g.supabase
        .from("cms_promo_banners")
        .update(payload)
        .eq("id", input.id)
    : await g.supabase.from("cms_promo_banners").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]`, "page");
  revalidatePath(`/[locale]/admin/cms/promos`, "page");
  return { ok: true };
}

export async function deleteBanner(id: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_promo_banners")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]`, "page");
  revalidatePath(`/[locale]/admin/cms/promos`, "page");
  return { ok: true };
}

// ---- Brands / Features / Cities ----

export async function upsertBrand(input: {
  slug: string;
  displayName: string;
  logoUrl?: string | null;
  isActive: boolean;
  position: number;
  isNew?: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    slug: input.slug,
    display_name: input.displayName,
    logo_url: input.logoUrl ?? null,
    is_active: input.isActive,
    position: input.position,
  };
  const { error } = input.isNew
    ? await g.supabase.from("cms_brands").insert(payload)
    : await g.supabase
        .from("cms_brands")
        .update(payload)
        .eq("slug", input.slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/brands`, "page");
  revalidatePath(`/[locale]/seller/new/step-1`, "page");
  return { ok: true };
}

export async function deleteBrand(slug: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_brands")
    .delete()
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/brands`, "page");
  return { ok: true };
}

export async function upsertCity(input: {
  slug: string;
  nameAr?: string | null;
  nameFr: string;
  region?: string | null;
  isActive: boolean;
  position: number;
  isNew?: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    slug: input.slug,
    name_ar: input.nameAr ?? null,
    name_fr: input.nameFr,
    region: input.region ?? null,
    is_active: input.isActive,
    position: input.position,
  };
  const { error } = input.isNew
    ? await g.supabase.from("cms_cities").insert(payload)
    : await g.supabase
        .from("cms_cities")
        .update(payload)
        .eq("slug", input.slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/cities`, "page");
  return { ok: true };
}

export async function deleteCity(slug: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_cities")
    .delete()
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/cities`, "page");
  return { ok: true };
}

export async function upsertFeature(input: {
  slug: string;
  labelAr?: string | null;
  labelFr: string;
  category?: string | null;
  isActive: boolean;
  position: number;
  isNew?: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    slug: input.slug,
    label_ar: input.labelAr ?? null,
    label_fr: input.labelFr,
    category: input.category ?? null,
    is_active: input.isActive,
    position: input.position,
  };
  const { error } = input.isNew
    ? await g.supabase.from("cms_features").insert(payload)
    : await g.supabase
        .from("cms_features")
        .update(payload)
        .eq("slug", input.slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/features`, "page");
  return { ok: true };
}

export async function deleteFeature(slug: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_features")
    .delete()
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/features`, "page");
  return { ok: true };
}

// ---- Categories (body types with admin-managed images) ----

export async function upsertCategory(input: {
  slug: string;
  nameAr?: string | null;
  nameFr: string;
  imageUrl?: string | null;
  isVisible: boolean;
  position: number;
  isNew?: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    slug: input.slug,
    name_ar: input.nameAr ?? null,
    name_fr: input.nameFr,
    image_url: input.imageUrl ?? null,
    is_visible: input.isVisible,
    position: input.position,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.isNew
    ? await g.supabase.from("cms_categories").insert(payload)
    : await g.supabase
        .from("cms_categories")
        .update(payload)
        .eq("slug", input.slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/categories`, "page");
  revalidatePath(`/[locale]`, "page");
  revalidatePath(`/[locale]/auctions`, "page");
  return { ok: true };
}

export async function deleteCategory(slug: string): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_categories")
    .delete()
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/categories`, "page");
  revalidatePath(`/[locale]`, "page");
  return { ok: true };
}

// ---- Subscription plans (Silver / Gold / Diamond / custom) ----

export interface PlanInput {
  slug: string;
  nameAr?: string | null;
  nameFr: string;
  taglineAr?: string | null;
  taglineFr?: string | null;
  monthlyPrice: number;
  listingsPerMonth: number;
  searchPriorityPct: number;
  featuredListingDiscountPct: number;
  hasTrustedSellerBadge: boolean;
  hasHomepagePlacement: boolean;
  hasCustomReports: boolean;
  maxListingDurationDays: number;
  maxPhotos: number;
  maxVideoSeconds: number;
  maxConcurrentActiveListings: number;
  autoRenewListings: boolean;
  directPhoneVisible: boolean;
  bulkImportEnabled: boolean;
  analyticsLevel: "basic" | "advanced" | "advanced_export";
  showroomLevel: "none" | "standard" | "custom" | "branded";
  supportLevel: "email" | "chat" | "dedicated";
  features: string[];
  badgeTone: "silver" | "gold" | "diamond" | "custom";
  isVisible: boolean;
  position: number;
  isNew?: boolean;
}

export async function upsertSubscriptionPlan(
  input: PlanInput,
): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const payload = {
    slug: input.slug,
    name_ar: input.nameAr ?? null,
    name_fr: input.nameFr,
    tagline_ar: input.taglineAr ?? null,
    tagline_fr: input.taglineFr ?? null,
    monthly_price: input.monthlyPrice,
    listings_per_month: input.listingsPerMonth,
    search_priority_pct: input.searchPriorityPct,
    featured_listing_discount_pct: input.featuredListingDiscountPct,
    has_trusted_seller_badge: input.hasTrustedSellerBadge,
    has_homepage_placement: input.hasHomepagePlacement,
    has_custom_reports: input.hasCustomReports,
    max_listing_duration_days: input.maxListingDurationDays,
    max_photos: input.maxPhotos,
    max_video_seconds: input.maxVideoSeconds,
    max_concurrent_active_listings: input.maxConcurrentActiveListings,
    auto_renew_listings: input.autoRenewListings,
    direct_phone_visible: input.directPhoneVisible,
    bulk_import_enabled: input.bulkImportEnabled,
    analytics_level: input.analyticsLevel,
    showroom_level: input.showroomLevel,
    support_level: input.supportLevel,
    features: input.features,
    badge_tone: input.badgeTone,
    is_visible: input.isVisible,
    position: input.position,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.isNew
    ? await g.supabase.from("cms_subscription_plans").insert(payload)
    : await g.supabase
        .from("cms_subscription_plans")
        .update(payload)
        .eq("slug", input.slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/plans`, "page");
  revalidatePath(`/[locale]/pricing`, "page");
  return { ok: true };
}

export async function deleteSubscriptionPlan(
  slug: string,
): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase
    .from("cms_subscription_plans")
    .delete()
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/plans`, "page");
  revalidatePath(`/[locale]/pricing`, "page");
  return { ok: true };
}

// ---- Notification templates ----

export async function upsertNotifTemplate(input: {
  kind: string;
  locale: string;
  title: string;
  body: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const { error } = await g.supabase.from("notification_templates").upsert({
    kind: input.kind,
    locale: input.locale,
    title: input.title,
    body: input.body,
    in_app: input.inApp,
    email: input.email,
    sms: input.sms,
    push: input.push,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/cms/notifications`, "page");
  return { ok: true };
}

// ---- Contact inbox ----

export async function setContactStatus(input: {
  id: string;
  status: "open" | "reading" | "replied" | "closed";
  reply?: string | null;
}): Promise<Result> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "replied") {
    patch.reply_body = input.reply ?? null;
    patch.replied_by = g.userId;
    patch.replied_at = new Date().toISOString();
  }
  const { error } = await g.supabase
    .from("contact_messages")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/contact-inbox`, "page");
  return { ok: true };
}
