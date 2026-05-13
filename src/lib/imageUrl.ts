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
 *   → /storage/v1/render/image/public/...?width=600&quality=62&format=webp
 *
 * Unsplash URLs (only on seed auctions during testing):
 *   https://images.unsplash.com/photo-…
 *   → same URL + ?w=600&q=62&auto=format&fit=crop
 *
 * Format defaults to webp because every browser we care about (Chrome,
 * Safari 14+, Firefox 65+, Edge, mobile Safari, Samsung Internet) has
 * supported WebP for years now — 97% of Tunisia mobile traffic per
 * caniuse. Pass `format: "origin"` to bypass conversion (admins
 * editing transparent logos / brand PNGs need to keep alpha).
 */
export function thumb(
  url: string | null | undefined,
  opts: {
    width?: number;
    height?: number;
    quality?: number;
    resize?: "cover" | "contain" | "fill";
    /** "webp" (default) = always emit WebP. "origin" = keep source
     *  format (use for transparent logos). */
    format?: "webp" | "origin";
  } = {},
): string {
  if (!url) return "";
  const {
    width = 600,
    // Default dropped 70 → 62. At the sizes most call-sites use
    // (240-720 wide thumbnails on mobile/grid), 62 is visually
    // indistinguishable from 70 to the human eye but ~15-20% smaller
    // on disk + over-the-wire. Hero/gallery call-sites pass an
    // explicit higher value where it matters.
    quality = 62,
    resize = "cover",
    height,
    format = "webp",
  } = opts;

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
    // `auto=format` lets Unsplash pick the best modern format the
    // client supports — typically WebP, falling back to JPEG for
    // ancient browsers. Equivalent to the explicit format=webp we
    // pass to Supabase, but Unsplash decides per-request.
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
  if (format === "webp") {
    // Force WebP output regardless of source format. ~30-40% smaller
    // than JPEG/PNG at the same perceived quality. Skipped only when
    // the caller passes format="origin" (transparency-preserving
    // admin previews).
    params.set("format", "webp");
  }
  return `${transformed}?${params.toString()}`;
}
