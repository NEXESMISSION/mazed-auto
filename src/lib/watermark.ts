"use client";

/**
 * Stamp the Mazed monogram into the middle of a listing photo.
 *
 * WHY THE MIDDLE. A corner watermark is removed with one crop, and on a
 * classifieds site the photos ARE the product — they get lifted and reposted
 * on Facebook groups and rival boards within hours. Centred, the only way to
 * remove it is to crop away the subject, which is exactly the trade we want to
 * force.
 *
 * WHAT IT SAYS. The monogram alone identifies us to somebody who already
 * knows us, which is the wrong audience — the person who matters is the one
 * seeing the photo on somebody else's Facebook post. So the stamp carries the
 * business name AND the domain under the mark: the name so the picture is
 * attributable at a glance, the domain so acting on it needs no search. The
 * caption is baked into `logo-stamp.webp` rather than drawn with `fillText`,
 * because drawing it here would make every stamped photo depend on the web
 * font having loaded at the instant the seller picked the file — a seller on a
 * slow phone would get the fallback system font burnt into their photo for
 * ever. See `scripts/make-watermark-stamp.py`.
 *
 * WHY THIS STRENGTH. The mark has to survive being stolen, not dominate the
 * photo a seller paid to publish. 45% opacity over 38% of the image width is
 * where both hold on a real listing photo: the monogram reads, the caption is
 * legible rather than merely present, and the car underneath is unobscured.
 * The caption is what sets the floor — thin letterspaced caps disappear
 * several stops before a solid monogram does, so a strength chosen by looking
 * at the monogram alone leaves the words unreadable and the stamp pointless.
 *
 * WHY IT IS DRAWN, NOT COMPOSITED SERVER-SIDE. Photos go straight from the
 * browser to storage on a signed URL — the bytes never pass through our
 * server. Watermarking here is what stamps every image that reaches the
 * bucket. It follows that a determined seller with devtools could upload
 * unmarked bytes; that is not the threat. The threat is someone else lifting
 * a published photo, and for that every published photo carrying the mark is
 * exactly the property we need.
 */

/** Fraction of the image's WIDTH the mark spans. */
const MARK_WIDTH_RATIO = 0.38;
/** Never smaller than this, or the caption stops being readable. */
const MIN_MARK_PX = 160;
/** How present the mark is. Set by the caption, not the monogram. */
const MARK_OPACITY = 0.45;
/** Monogram over « MAZED AUTO · MAZED.TN », gold on transparent, ~2.39:1. */
const MARK_SRC = "/logo-stamp.webp";

/**
 * The decoded mark, fetched once per page rather than per photo.
 *
 * A seller uploads eight photos at a time; without this the same 28 KB file
 * is fetched and decoded eight times while the phone is already busy
 * re-encoding images.
 */
let markPromise: Promise<HTMLImageElement | null> | null = null;

function loadMark(): Promise<HTMLImageElement | null> {
  if (markPromise) return markPromise;
  markPromise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    // Same-origin, but decoding into a canvas we later export means the
    // canvas must not be tainted.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = MARK_SRC;
  });
  return markPromise;
}

/**
 * Draw the mark centred on an already-rendered 2D context.
 *
 * Exported separately so a caller that already has a canvas (a future
 * server-side or worker path) can stamp without a second decode.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  mark: HTMLImageElement,
  width: number,
  height: number,
): void {
  const aspect = mark.naturalHeight / mark.naturalWidth;

  // Fit, then centre. `MIN_MARK_PX` is a floor on legibility, not a promise
  // that the photo is big enough to hold it: the catalogue contains a 120x120
  // thumbnail, and asking for a 160px mark on it drew a stamp wider than the
  // image. The canvas does not complain — it just crops the mark and produces
  // a photo branded with a fragment of a logo.
  let markW = Math.min(Math.max(MIN_MARK_PX, Math.round(width * MARK_WIDTH_RATIO)), width);
  let markH = Math.round(markW * aspect);
  if (markH > height) {
    markH = height;
    markW = Math.round(markH / aspect);
  }
  const x = Math.round((width - markW) / 2);
  const y = Math.round((height - markH) / 2);

  ctx.save();
  ctx.globalAlpha = MARK_OPACITY;

  // A soft dark shadow under the gold. The monogram is bright, so it reads on
  // its own against a dark photo but disappears into an overexposed sky or a
  // white studio background — which is most parts photography. The shadow is
  // what keeps it legible on both without raising the opacity.
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(6, Math.round(markW * 0.035));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, Math.round(markW * 0.006));

  ctx.drawImage(mark, x, y, markW, markH);
  ctx.restore();
}

/**
 * Return a copy of `file` with the monogram stamped in the middle.
 *
 * Returns the ORIGINAL file if anything goes wrong — a missing logo, a
 * browser that will not encode, a decode failure. A photo without a watermark
 * is worth far more to the seller than a failed upload, so this never throws
 * and never blocks.
 */
export async function watermarkImage(file: File): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  try {
    const [mark, bitmap] = await Promise.all([loadMark(), createImageBitmap(file)]);
    if (!mark) return file;

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    drawWatermark(ctx, mark, canvas.width, canvas.height);

    // Re-encode as WebP at a high quality. The input has already been through
    // `compressImage`, so this pass is about preserving what is there rather
    // than squeezing further — encoding a second time at the same quality is
    // what turns a clean photo into a smeared one.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.92),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}
