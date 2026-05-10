"use client";

const TAG = "[compress]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}
function warn(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.warn(
    `%c${TAG} %c${ts}`,
    "color:#f59e0b;font-weight:bold",
    "color:#888",
    ...args,
  );
}

export interface CompressOptions {
  /** Hard cap on the longer image side, in pixels. Default 1920. */
  maxEdge?: number;
  /** JPEG quality 0-1. Default 0.85. KYC docs use 0.92 for OCR clarity. */
  quality?: number;
  /** Skip compression if the source file is already smaller than this
   *  many bytes. Default 200KB — re-encoding tiny images can grow them. */
  skipBelowBytes?: number;
}

/**
 * Client-side image compression. Decodes the input File on a canvas,
 * scales it down so the longer edge ≤ maxEdge (preserving aspect),
 * and re-encodes as JPEG. Returns the resulting File ready for upload.
 *
 * Why not server-side: every camera capture on a phone produces a
 * 2-3 MB PNG/HEIC. Uploading that raw burns mobile data, slows the
 * KYC flow, and inflates Supabase storage costs. The same photo
 * re-encoded at 1920px JPEG q=0.85 is typically 100-300 KB with no
 * visible quality loss for review screens.
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
    maxEdge = 1920,
    quality = 0.85,
    skipBelowBytes = 200 * 1024,
  } = opts;

  // Only compress images. Videos and anything else go through unchanged.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < skipBelowBytes) {
    log("skip — already small", {
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
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) throw new Error("CANVAS_TO_BLOB_FAILED");

    // If the re-encode is somehow larger (very rare — happens with very
    // small or already-JPEG-q90 originals), keep the original.
    if (blob.size >= file.size) {
      log("skip — re-encode larger than original", {
        origKB: Math.round(file.size / 1024),
        newKB: Math.round(blob.size / 1024),
      });
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const out = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
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
