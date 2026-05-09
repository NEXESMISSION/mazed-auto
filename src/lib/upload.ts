"use client";

import { createClient } from "@/lib/supabase/client";

const TAG = "[upload]";
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
function err(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
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

/**
 * Uploads a file to the auction-media bucket inside the user's folder
 * and returns its public URL. RLS ensures only the user can write to
 * their own folder. Caller decides which sub-folder to use ("auctions",
 * "carte-grise", "kyc", etc.).
 */
export async function uploadToBucket(
  file: File,
  userId: string,
  folder: string,
): Promise<UploadResult> {
  const supabase = createClient();
  const ext =
    file.name.split(".").pop()?.toLowerCase() ||
    (file.type.startsWith("video/") ? "mp4" : "jpg");
  const path = `${userId}/${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const contentType =
    file.type || (ext === "mp4" ? "video/mp4" : "image/jpeg");

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
