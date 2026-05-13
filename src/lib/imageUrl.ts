/**
 * Image-transform helper. Rewrites URLs from the two image hosts the
 * app uses (Supabase Storage for real uploads, Unsplash for seed/test
 * data) so consumers load resized + recompressed variants instead of
 * the multi-MB originals.
 *
 * Non-matching URLs are returned unchanged.
 *
 * Supabase Storage URLs:
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   → /storage/v1/render/image/public/...?width=600&quality=70
 *
 * Unsplash URLs (only on seed auctions during testing):
 *   https://images.unsplash.com/photo-…
 *   → same URL + ?w=600&q=70&auto=format&fit=crop
 */
export function thumb(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } = {},
): string {
  if (!url) return "";
  const { width = 600, quality = 70, resize = "cover", height } = opts;

  // Unsplash (seed/test images). Their CDN supports w/h/q/fit/auto knobs
  // — without this branch the seed auctions pulled the full 5-10 MB
  // original on every render, which is what made the home page feel
  // slow during testing. Strip any existing query so we don't stack
  // params on a re-rendered tile.
  if (url.startsWith("https://images.unsplash.com/")) {
    const base = url.split("?")[0];
    const params = new URLSearchParams();
    params.set("w", String(width));
    if (height) params.set("h", String(height));
    params.set("q", String(quality));
    params.set("auto", "format");
    if (resize === "cover") params.set("fit", "crop");
    return `${base}?${params.toString()}`;
  }

  // Supabase Storage — rewrite to the render-image endpoint.
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const params = new URLSearchParams();
  params.set("width", String(width));
  if (height) params.set("height", String(height));
  params.set("quality", String(quality));
  params.set("resize", resize);
  return `${transformed}?${params.toString()}`;
}
