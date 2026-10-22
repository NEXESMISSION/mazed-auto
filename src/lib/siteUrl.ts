/**
 * The site's absolute origin, for canonical links and structured data, which
 * must be absolute: the configured public URL, else this Vercel deployment,
 * else production.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mazed-auto.vercel.app")
  ).replace(/\/$/, "");
}
