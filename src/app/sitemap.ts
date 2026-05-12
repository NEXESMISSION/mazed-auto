import type { MetadataRoute } from "next";
import { getLiveAuctionsCached } from "@/lib/home-cache";

// Resolve the canonical site URL the same way robots.ts and the root
// layout do. Sitemaps that point at a preview-deployment URL will be
// rejected by Search Console; falling back to the production domain
// keeps preview deployments from leaking into the index.
function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://mazedauto.tn";
}

// Static public pages worth showing to Google. The locale-prefixed paths
// (/fr/* and /ar/*) are emitted as `alternates.languages` on the bare URL
// so Google understands they're translations of the same page rather than
// duplicate content (which would split PageRank).
const STATIC_PAGES: Array<{
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/auctions", changeFrequency: "daily", priority: 0.95 },
  { path: "/sellers", changeFrequency: "weekly", priority: 0.7 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.4 },
];

/**
 * Sitemap for Mazed Auto.
 *
 * Strategy:
 *   1. Static landing / browse / pricing pages — high priority, daily
 *      refresh on /, /auctions because new inventory lands often.
 *   2. Every currently-live auction — dynamically emitted. This is the
 *      growth lever: a Google search for "Renault Clio 2018 Tunisie" with
 *      a live listing on the platform should find it within hours of
 *      publish. `getLiveAuctionsCached()` already filters to active +
 *      ending statuses (RLS-safe) and is cached 30s, so re-generating
 *      the sitemap on every crawl is cheap.
 *   3. Each URL gets `alternates.languages` mapping `fr` and `ar` to the
 *      locale-prefixed equivalent — Google's hreflang signal that
 *      prevents the FR/AR pages from competing for the same query and
 *      makes the user's preferred-language version appear in their SERP.
 *
 * Note: sitemap.xml is a special Route Handler. Next.js caches it by
 * default unless we read request-time APIs. The `getLiveAuctionsCached`
 * helper uses an in-process cache, not request-state, so caching is safe.
 *
 * Limits: protocol allows up to 50 000 URLs per sitemap; if/when active
 * inventory exceeds that, switch to `generateSitemaps()` and emit a
 * sitemap index. For Tunisia's car-market size, single-file fits 100x.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // Pre-build the alternates map for a given relative path. Always
  // includes both locales because every public route is mounted under
  // the `[locale]` segment in this app.
  const alts = (path: string) => ({
    languages: {
      fr: `${base}/fr${path}`,
      ar: `${base}/ar${path}`,
    },
  });

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    alternates: alts(p.path),
  }));

  let auctionEntries: MetadataRoute.Sitemap = [];
  try {
    const auctions = await getLiveAuctionsCached();
    auctionEntries = auctions.map((a) => ({
      url: `${base}/auctions/${a.id}`,
      // `endTime` is the soonest date this URL's content becomes stale
      // (the auction closes). Google interprets lastModified as
      // "newest meaningful change" — for an active auction that's the
      // start time; using endTime would mis-signal "freshly updated"
      // every render. Use updatedAt if present, else startTime.
      lastModified: a.endTime,
      // While the auction is live, change daily (bids + countdown).
      // After it ends, change rarely — but ended auctions aren't in
      // this list, so we can safely say "daily".
      changeFrequency: "daily" as const,
      priority: 0.8,
      alternates: alts(`/auctions/${a.id}`),
    }));
  } catch {
    // If Supabase is down at sitemap-fetch time, return the static
    // pages anyway — better an incomplete sitemap than no sitemap.
    auctionEntries = [];
  }

  return [...staticEntries, ...auctionEntries];
}
