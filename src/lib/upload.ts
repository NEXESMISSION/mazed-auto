"use client";

import { createClient } from "@/lib/supabase/client";

const TAG = "[upload]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
   
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}
function err(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
   
  console.error(
    `%c${TAG} %c${ts}`,
    "color:#ef4444;font-weight:bold",
    "color:#888",
    ...args,
  );
}

export interface UploadResult {
  url: string;
  path: string;
}

// ─── Validation policy ─────────────────────────────────────────────────────
//
// Storage RLS already scopes writes to the caller's own folder, so an
// attacker can't smuggle a file into someone else's path. What RLS does
// NOT do is enforce MIME / size / extension correctness — those checks
// live here, before bytes leave the browser, so users see a friendly
// error rather than waiting on a 5MB upload that the bucket policy
// later rejects.
//
// The MAX_BYTES values are pragmatic: 8MB lets a high-res phone photo
// through (modern iPhones produce ~3–5MB JPEGs), 50MB covers a short
// liveness recording or a hand-held walkaround. The MIME allowlists are
// deliberately narrow — we serve these straight back from Supabase
// public URLs, and an unexpected `application/octet-stream` posing as an
// image is the classic vector for "stored XSS via crafted SVG."

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DOC_BYTES = 12 * 1024 * 1024; // 12 MB (PDFs for carte-grise etc.)

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime", // .mov from iOS
  "video/webm",
]);
const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
]);

// Map MIME → canonical extension. Never trust `file.name.split(".").pop()` —
// a user can rename `shell.php` to `shell.php.jpg` and the browser still
// reports `image/jpeg` for the *content sniff*, but the server-side
// extension matters for some edge handlers (Supabase storage uses the
// extension to set Content-Disposition on download). Anchor on MIME.
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

export class UploadValidationError extends Error {
  constructor(
    message: string,
    public readonly code: "MIME_NOT_ALLOWED" | "FILE_TOO_LARGE" | "EMPTY_FILE",
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function validateFile(file: File): { ext: string; contentType: string } {
  if (!file.size || file.size <= 0) {
    throw new UploadValidationError("Le fichier est vide.", "EMPTY_FILE");
  }
  const mime = (file.type || "").toLowerCase();
  if (ALLOWED_IMAGE_MIME.has(mime)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new UploadValidationError(
        `Image trop volumineuse (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`,
        "FILE_TOO_LARGE",
      );
    }
    return { ext: MIME_TO_EXT[mime] ?? "jpg", contentType: mime };
  }
  if (ALLOWED_VIDEO_MIME.has(mime)) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new UploadValidationError(
        `Vidéo trop volumineuse (max ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`,
        "FILE_TOO_LARGE",
      );
    }
    return { ext: MIME_TO_EXT[mime] ?? "mp4", contentType: mime };
  }
  if (ALLOWED_DOC_MIME.has(mime)) {
    if (file.size > MAX_DOC_BYTES) {
      throw new UploadValidationError(
        `Document trop volumineux (max ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB).`,
        "FILE_TOO_LARGE",
      );
    }
    return { ext: MIME_TO_EXT[mime] ?? "pdf", contentType: mime };
  }
  throw new UploadValidationError(
    `Format non supporté (${mime || "inconnu"}). Formats acceptés: JPG, PNG, WebP, HEIC, MP4, MOV, WebM, PDF.`,
    "MIME_NOT_ALLOWED",
  );
}

/**
 * Uploads a file to the auction-media bucket inside the user's folder
 * and returns its public URL. RLS ensures only the user can write to
 * their own folder. Caller decides which sub-folder to use ("auctions",
 * "carte-grise", "kyc", etc.).
 *
 * Throws `UploadValidationError` for client-side validation failures
 * (unsupported MIME, oversize) so callers can surface a clean toast
 * without waiting on a network round-trip.
 */
export async function uploadToBucket(
  file: File,
  userId: string,
  folder: string,
): Promise<UploadResult> {
  const { ext, contentType } = validateFile(file);
  const supabase = createClient();

  // Server-generated filename only — never `file.name`. The user has no
  // input into the path beyond their own user id (enforced by RLS) and
  // the folder string (an internal enum passed by the caller). The
  // timestamp + random suffix makes accidental collisions impossible.
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${folder}/${Date.now()}-${rand}.${ext}`;

  log("upload start", {
    bucket: "auction-media",
    path,
    contentType,
    sizeBytes: file.size,
    mime: file.type,
  });

  const t0 = performance.now();
  const { data, error } = await supabase.storage
    .from("auction-media")
    .upload(path, file, { contentType, upsert: false });
  const ms = Math.round(performance.now() - t0);

  if (error) {
    err("upload failed", { ms, path, error });
    throw error;
  }
  log("upload done", { ms, data });

  const { data: pub } = supabase.storage
    .from("auction-media")
    .getPublicUrl(path);
  log("publicUrl", pub.publicUrl);
  return { url: pub.publicUrl, path };
}
