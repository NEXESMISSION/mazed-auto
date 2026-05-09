"use client";

import { createClient } from "@/lib/supabase/client";

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
  const { error } = await supabase.storage
    .from("auction-media")
    .upload(path, file, {
      contentType: file.type || (ext === "mp4" ? "video/mp4" : "image/jpeg"),
      upsert: false,
    });
  if (error) throw error;
  const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
