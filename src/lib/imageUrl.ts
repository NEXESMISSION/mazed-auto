/**
 * Supabase Storage image-transform helper.
 *
 * Storage's public URLs look like
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
 * The image-render endpoint at the same project resizes + recompresses:
 *   https://<proj>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=600&quality=70
 *
 * We rewrite the URL when it points at our own Supabase storage so cards
 * load thumbnail-sized JPEGs (~30-80 KB) instead of the full 2-3 MB
 * originals — which is what was making the home page feel slow and the
 * "image doesn't show up" symptom (long tap-to-paint on flaky networks
 * makes the placeholder look like a broken image).
 *
 * Non-supabase URLs and already-transformed URLs are returned unchanged.
 */
export function thumb(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } = {},
): string {
  if (!url) return "";
  // Only rewrite Supabase Storage URLs.
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const { width = 600, quality = 70, resize = "cover", height } = opts;
  const params = new URLSearchParams();
  params.set("width", String(width));
  if (height) params.set("height", String(height));
  params.set("quality", String(quality));
  params.set("resize", resize);
  return `${transformed}?${params.toString()}`;
}
