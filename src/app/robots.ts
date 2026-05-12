import type { MetadataRoute } from "next";

// Resolve the absolute site URL at request time. Vercel sets VERCEL_URL
// to the auto-generated preview host; in production NEXT_PUBLIC_SITE_URL
// is the canonical custom domain. Falling back to the latter avoids
// "https://mazed-auto-web-abc123.vercel.app/sitemap.xml" leaking into
// preview-environment robots.txt, which Google would otherwise pick up.
function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://mazedauto.tn";
}

/**
 * `robots.txt` for Mazed Auto.
 *
 * Allow everything public (auctions browse, individual auction pages,
 * sellers directory, pricing, etc.) so Googlebot can index live
 * inventory — that's the entire growth play: a user in Sfax googling
 * "Renault Clio 2018 enchère Tunisie" should land directly on the live
 * auction. Disallow:
 *
 *   - /admin   — staff console, never useful in search
 *   - /seller  — seller dashboard / wizard, gated content
 *   - /buyer   — buyer dashboard, gated content
 *   - /api     — JSON endpoints, no human content
 *   - /auth    — OAuth callback paths
 *   - /payment — payment flows are short-lived per-user URLs
 *   - /kyc     — identity-verification flow
 *   - /login, /register, /verify-*  — auth flows, no value indexed
 *
 * `crawlDelay` is intentionally omitted: Google ignores it (uses Search
 * Console settings instead) and Bing's auto-tuning beats a fixed value.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/admin",
          "/admin/*",
          "/seller",
          "/seller/*",
          "/buyer",
          "/buyer/*",
          "/api/*",
          "/auth/*",
          "/payment/*",
          "/kyc/*",
          "/login",
          "/register",
          "/verify-email",
          "/verify-phone",
          "/reset-password",
          "/forgot-password",
          // Locale-prefixed variants — next-intl serves every route at
          // /fr/* and /ar/*, so the disallow needs both.
          "/fr/admin",
          "/fr/admin/*",
          "/fr/seller",
          "/fr/seller/*",
          "/fr/buyer",
          "/fr/buyer/*",
          "/fr/payment/*",
          "/fr/kyc/*",
          "/fr/login",
          "/fr/register",
          "/fr/verify-email",
          "/fr/verify-phone",
          "/fr/reset-password",
          "/fr/forgot-password",
          "/ar/admin",
          "/ar/admin/*",
          "/ar/seller",
          "/ar/seller/*",
          "/ar/buyer",
          "/ar/buyer/*",
          "/ar/payment/*",
          "/ar/kyc/*",
          "/ar/login",
          "/ar/register",
          "/ar/verify-email",
          "/ar/verify-phone",
          "/ar/reset-password",
          "/ar/forgot-password",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
