"use client";

const TAG = "[compress]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);

  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}
function warn(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);

  console.warn(
    `%c${TAG} %c${ts}`,
    "color:#f59e0b;font-weight:bold",
    "color:#888",
    ...args,
  );
}

export interface CompressOptions {
  /** Hard cap on the longer image side, in pixels. Default 1600. */
  maxEdge?: number;
  /** Encoder quality 0-1. Default 0.80 (WebP). KYC / carte-grise pass
   *  higher (~0.86) so OCR text stays crisp. */
  quality?: number;
  /** Skip compression if the source file is already smaller than this
   *  many bytes. Default 120KB — re-encoding tiny images can grow them. */
  skipBelowBytes?: number;
}

/**
 * Client-side image compression. Decodes the input File on a canvas,
 * scales it down so the longer edge ≤ maxEdge (preserving aspect),
 * and re-encodes as **WebP** (falling back to JPEG if the browser
 * can't encode WebP via canvas). Returns the File ready for upload.
 *
 * Why WebP at the source: an iPhone capture is a 2-5 MB HEIC/JPEG.
 * The previous pipeline re-encoded to JPEG q0.85 @ 1920px — which
 * still landed ~1.2 MB per photo (confirmed by a storage inventory:
 * 124 auction JPEGs averaging 1.27 MB). WebP q0.80 @ 1600px brings
 * the same photo down to ~200-350 KB with no visible quality loss
 * at any size we render — that's the file that hits Supabase
 * Storage, so every downstream transform + the cold render-endpoint
 * pass is 4-5× faster.
 *
 * Falls back to the original file on any failure (decode error, OOM
 * on huge images, etc.) so the upload never breaks because of the
 * compression step.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const {
    maxEdge = 1600,
    quality = 0.8,
    skipBelowBytes = 120 * 1024,
  } = opts;

  // Only compress images. Videos and anything else go through unchanged.
  if (!file.type.startsWith("image/")) return file;
  // A tiny source that's NOT already webp is still worth converting
  // (jpeg/png → webp shrinks even small files), so the skip-threshold
  // only applies to files that are already webp.
  if (file.type === "image/webp" && file.size < skipBelowBytes) {
    log("skip — already small webp", {
      name: file.name,
      sizeKB: Math.round(file.size / 1024),
    });
    return file;
  }

  const tStart = performance.now();
  try {
    // Prefer createImageBitmap — faster than HTMLImageElement and gives
    // us a head-detached pixel source we can paint to canvas directly.
    const bitmap = await createBitmap(file);
    const { srcW, srcH } = { srcW: bitmap.width, srcH: bitmap.height };

    let dstW = srcW;
    let dstH = srcH;
    if (Math.max(srcW, srcH) > maxEdge) {
      const scale = maxEdge / Math.max(srcW, srcH);
      dstW = Math.round(srcW * scale);
      dstH = Math.round(srcH * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    // White matte under the image — WebP keeps alpha, but a phone
    // photo has none, and a transparent canvas region (shouldn't
    // happen, but defensive) would otherwise encode as transparent.
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close?.();

    // Try WebP first. Every browser we target (Chrome, Edge, Firefox,
    // Safari 14+) can encode WebP through canvas.toBlob. If the
    // result isn't actually image/webp (very old Safari returns PNG),
    // fall back to JPEG so we still ship something smaller than the
    // raw capture.
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    let outExt = "webp";
    let outType = "image/webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
      outExt = "jpg";
      outType = "image/jpeg";
    }
    if (!blob) throw new Error("CANVAS_TO_BLOB_FAILED");

    // If the re-encode is somehow larger (rare — happens with already-
    // optimal small originals), keep the original.
    if (blob.size >= file.size) {
      log("skip — re-encode larger than original", {
        origKB: Math.round(file.size / 1024),
        newKB: Math.round(blob.size / 1024),
      });
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const out = new File([blob], `${baseName}.${outExt}`, { type: outType });
    log("compressed", {
      ms: Math.round(performance.now() - tStart),
      from: { w: srcW, h: srcH, kb: Math.round(file.size / 1024), type: file.type },
      to: { w: dstW, h: dstH, kb: Math.round(out.size / 1024), type: out.type },
      ratio: `${(file.size / out.size).toFixed(1)}x`,
    });
    return out;
  } catch (e) {
    warn("compress failed — using original", {
      name: file.name,
      error: e instanceof Error ? e.message : String(e),
    });
    return file;
  }
}

async function createBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap is supported on every modern browser we target
  // (Safari 15+, Chrome, Firefox). HEIC/HEIF from iOS may fail the
  // decode — caller's outer try/catch falls back to uploading the
  // original file in that case.
  if (typeof createImageBitmap === "undefined") {
    throw new Error("CREATE_IMAGE_BITMAP_UNAVAILABLE");
  }
  return await createImageBitmap(file);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
