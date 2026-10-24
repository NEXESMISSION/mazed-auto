import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

/** Private / transactional paths, without their locale prefix. */
const PRIVATE = [
  "/admin",
  "/account",
  "/pro/dashboard",
  "/pro/creer",
  "/kyc",
  "/payment",
  "/sell",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/**
 * /robots.txt — let crawlers index the public marketplace, keep them out of
 * the authenticated / transactional surfaces (no SEO value, and we don't want
 * admin or account URLs surfacing in search), in every language. Points at
 * the dynamic sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...routing.locales.flatMap((l) => PRIVATE.map((p) => `/${l}${p}`))],
      },
    ],
    sitemap: SITE_URL ? `${SITE_URL}/sitemap.xml` : undefined,
    host: SITE_URL,
  };
}
