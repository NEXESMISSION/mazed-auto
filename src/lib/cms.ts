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
