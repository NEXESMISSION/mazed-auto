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
 * WHY IT IS FAINT. The mark has to survive being stolen, not be the first
 * thing anybody sees. It was 45% over 38% of the width, chosen so the caption
 * would be crisply legible — which got the trade backwards: it made the logo
 * the loudest object in a photograph the seller took of their own car. 18%
 * over 30% is enough. A watermark does not have to be read at a glance to
 * work; it has to be impossible to remove without cropping the subject, and
 * that is a property of WHERE it sits, not how bright it is. Anyone who wants
 * to know whose photo it is can see it.
 *
 * WHY THE ASSET CHANGES WITH THE PHOTO. The caption is baked in at a fixed
 * size relative to the mark, so on a small or low-quality upload it lands at a
 * handful of pixels tall and turns to mush — a smear that reads as a
 * compression artefact rather than as our name, which is worse than no caption
 * at all. Under `CAPTION_MIN_PHOTO_PX` the plain monogram is used instead: the
 * mark stays clean at any size, and the words appear only where there is
 * enough resolution to carry them.
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
const MARK_WIDTH_RATIO = 0.3;
/** A floor so the mark does not vanish entirely on a tiny upload. */
const MIN_MARK_PX = 96;
/** How present the mark is. Deliberately low — see the note above. */
const MARK_OPACITY = 0.18;
/**
 * Below this photo width the caption would be under ~14px tall once scaled,
 * which on a low-quality upload is indistinguishable from JPEG noise.
 */
const CAPTION_MIN_PHOTO_PX = 1000;
/** Monogram over « MAZED AUTO · MAZED.TN », gold on transparent, ~2.39:1. */
const STAMP_SRC = "/logo-stamp.webp";
/** The monogram alone, for photos too small to carry the caption. */
const MARK_SRC = "/logo-mark.webp";

/**
 * The decoded mark, fetched once per page rather than per photo.
 *
 * A seller uploads eight photos at a time; without this the same 28 KB file
 * is fetched and decoded eight times while the phone is already busy
 * re-encoding images.
 */
const marks = new Map<string, Promise<HTMLImageElement | null>>();

function loadMark(src: string): Promise<HTMLImageElement | null> {
  const cached = marks.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    // Same-origin, but decoding into a canvas we later export means the
    // canvas must not be tainted.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  marks.set(src, p);
  return p;
}

/** Which of the two marks a photo this wide can carry. */
export function markSrcFor(width: number): string {
  return width >= CAPTION_MIN_PHOTO_PX ? STAMP_SRC : MARK_SRC;
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

  // Fit, then centre. The floor is a floor, not a promise that the photo is
  // big enough to hold it: the catalogue contains a 120x120 thumbnail, and
  // asking for a mark wider than the image draws a stamp the canvas silently
  // crops — a photo branded with a fragment of a logo.
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
    const bitmap = await createImageBitmap(file);
    const mark = await loadMark(markSrcFor(bitmap.width));
    if (!mark) {
      bitmap.close?.();
      return file;
    }

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
