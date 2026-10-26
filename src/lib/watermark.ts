"use client";

/**
 * Stamp the Mazed Auto emblem into the top-left corner of a listing photo.
 *
 * WHERE AND WHAT. The ring emblem, in its own gold and silver, small (13% of
 * the width), in the top-left corner — the way a channel logo sits on a
 * picture. It used to be centred, faint and grey, so that cropping it out
 * meant cropping the car out; on every photo of the catalogue that put a
 * logo across the middle of somebody's car, and the owner chose the corner.
 * The trade is known: a corner can be cropped off. The photo still says whose
 * it is everywhere it is shown untouched, which is most reposts.
 *
 * It stays in the top-left in Arabic too: the photo is the same file for both
 * languages.
 *
 * Mirrored by scripts/watermark-recipe.mjs, which re-stamps photos already in
 * storage: a change here must be made there too.
 *
 * WHY IT IS DRAWN, NOT COMPOSITED SERVER-SIDE. Photos go straight from the
 * browser to storage on a signed URL — the bytes never pass through our
 * server. Watermarking here is what stamps every image that reaches the
 * bucket. It follows that a determined seller with devtools could upload
 * unmarked bytes; that is not the threat. The threat is someone else lifting
 * a published photo, and for that every published photo carrying the mark is
 * exactly the property we need.
 */

import { LOGO } from "@/lib/brand";

/** Fraction of the image's WIDTH the mark spans. */
export const MARK_WIDTH_RATIO = 0.13;
/** A floor so the mark stays a logo on a small upload. */
export const MIN_MARK_PX = 56;
/** The gap to the top and left edges, as a fraction of the SHORTER side. */
export const MARGIN_RATIO = 0.03;
/** Nearly solid: the logo as it is, not a ghost of it. */
export const MARK_OPACITY = 0.92;
/** The emblem in colour, on transparent. */
const MARK_SRC = LOGO.markWebp.src;

/**
 * Where the mark goes on a photo this size: top-left, inside the margins,
 * never wider or taller than the photo can hold. Pure, so it is tested.
 */
export function cornerRect(
  width: number,
  height: number,
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  const margin = Math.round(Math.min(width, height) * MARGIN_RATIO);
  let w = Math.min(Math.max(MIN_MARK_PX, Math.round(width * MARK_WIDTH_RATIO)), width - 2 * margin);
  let h = Math.round(w * aspect);
  if (h > height - 2 * margin) {
    h = Math.max(1, height - 2 * margin);
    w = Math.round(h / aspect);
  }
  return { x: margin, y: margin, w: Math.max(1, w), h };
}

/**
 * The decoded mark, fetched once per page rather than per photo.
 *
 * A seller uploads eight photos at a time; without this the same file is
 * fetched and decoded eight times while the phone is already busy
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

/**
 * Draw the mark in the top-left corner of an already-rendered 2D context.
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
  const { x, y, w, h } = cornerRect(width, height, mark.naturalHeight / mark.naturalWidth);

  ctx.save();
  ctx.globalAlpha = MARK_OPACITY;
  // A soft dark shadow, so the gold and silver still read on an overexposed
  // sky or a white studio wall — which is most parts photography.
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.max(2, Math.round(w * 0.04));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, Math.round(w * 0.01));
  ctx.drawImage(mark, x, y, w, h);
  ctx.restore();
}

/**
 * Return a copy of `file` with the emblem stamped in its top-left corner.
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
    const mark = await loadMark(MARK_SRC);
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
