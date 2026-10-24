import type { MetadataRoute } from "next";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

// Regenerate at most hourly — listings change on the order of minutes, and a
// search crawler doesn't need second-fresh URLs. Keeps the DB read off the
// hot path.
export const revalidate = 3600;

/**
 * Dynamic sitemap. Public, crawlable surfaces only:
 *   - the static marketing/legal pages
 *   - every PUBLISHED annonce (the v3 catalog)
 *   - every auction whose property is `ready` and that is publicly visible —
 *     kept while lots are still running; it retires with them (Phase 6)
 *
 * Authenticated areas (admin/account/kyc/payment/sell) are excluded here and
 * in robots.ts. Uses the cookieless service-role client like the home feed.
 *
 * Every page is listed once per language (/fr/…, /ar/…), each entry naming
 * the other versions — the sitemap form of hreflang.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL?.replace(/\/$/, "") ?? "";

  /** One entry per locale for a path without its locale ("" for home). */
  const localized = (path: string, entry: Omit<MetadataRoute.Sitemap[number], "url">): MetadataRoute.Sitemap => {
    const languages = Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`]));
    return routing.locales.map((l) => ({ url: `${base}/${l}${path}`, ...entry, alternates: { languages } }));
  };

  // /properties is gone from here: the auction gate redirects it to the
  // catalogue, and a sitemap should only list pages that answer 200.
  const staticRoutes: MetadataRoute.Sitemap = [
    ...localized("", { changeFrequency: "hourly", priority: 1 }),
    ...localized("/annonces", { changeFrequency: "hourly", priority: 1 }),
    ...localized("/terms", { changeFrequency: "yearly", priority: 0.2 }),
    ...localized("/privacy", { changeFrequency: "yearly", priority: 0.2 }),
    ...localized("/contact", { changeFrequency: "monthly", priority: 0.3 }),
  ];

  const sb = getServiceSupabase();
  if (!sb || !base) return staticRoutes;

  try {
    // The v3 catalog. Only published listings are crawlable — a draft or an
    // expired annonce is not a page anyone should land on from a search result.
    const { data: annonces } = await sb
      .from("listings")
      .select("id, updated_at, published_at, expires_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);

    const annonceRoutes: MetadataRoute.Sitemap = (annonces ?? []).flatMap((row) => {
      const r = row as { id: string; updated_at: string | null; published_at: string | null };
      return localized(`/annonces/${r.id}`, {
        lastModified: r.updated_at ?? r.published_at ?? undefined,
        changeFrequency: "daily",
        priority: 0.8,
      });
    });

    // A second block listed `auctions` joined to `properties` here, emitting
    // /fr/auctions/<id> URLs. Both tables read zero rows since the pivot, so it
    // contributed nothing but a round trip — and any URL it had emitted would
    // now 404, since the route was deleted with the product.

    // Shop pages, once they are public (`pro_shops`, 0189). Before that they
    // 404 for a crawler, so listing them would only teach it dead URLs.
    const { data: flag } = await sb.from("app_settings").select("value").eq("key", "pro_shops").maybeSingle();
    let shopRoutes: MetadataRoute.Sitemap = [];
    if ((flag?.value as { enabled?: boolean } | null)?.enabled === true) {
      const { data: shops } = await sb
        .from("shops")
        .select("slug, updated_at")
        .eq("status", "active")
        .limit(2000);
      shopRoutes = [
        ...localized("/boutiques", { changeFrequency: "daily", priority: 0.7 }),
        ...localized("/pro", { changeFrequency: "weekly", priority: 0.5 }),
        ...(shops ?? []).flatMap((s) =>
          localized(`/boutiques/${s.slug as string}`, {
            lastModified: (s.updated_at as string | null) ?? undefined,
            changeFrequency: "daily",
            priority: 0.7,
          }),
        ),
      ];
    }

    return [...staticRoutes, ...annonceRoutes, ...shopRoutes];
  } catch {
    // Never let a DB hiccup 500 the sitemap — degrade to static routes.
    return staticRoutes;
  }
}
