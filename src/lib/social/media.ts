import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialNetwork } from "./utm";

/**
 * The annonce's own photos, as each network takes them — never other photos
 * (brief §4: « photos originales »).
 *
 * The photos are stored as WebP and Instagram publishes JPEG only, so each
 * one is converted and written to the public `social-media` bucket, where Meta
 * fetches it by URL:
 *   * Instagram: 1080 × 1080, the whole photo fitted inside on a dark ground —
 *     the network crops anything outside 4:5…1.91:1, and a car cut in half
 *     sells nothing; one square format also keeps a carousel even;
 *   * Facebook: the photo as framed, at most 2048 px on its longer side.
 * Up to 10 photos — a carousel's limit — cover first.
 */

export type PreparedMedia = { source: string; path: string; url: string };

const MAX = 10;

export async function prepareMedia(
  admin: SupabaseClient,
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[],
  requestId: string,
  network: SocialNetwork,
): Promise<PreparedMedia[]> {
  const ordered = [...photos].sort((a, b) => Number(!!b.is_cover) - Number(!!a.is_cover) || a.sort_order - b.sort_order).slice(0, MAX);
  const out: PreparedMedia[] = [];
  for (const [i, p] of ordered.entries()) {
    const { data, error } = await admin.storage.from("properties").download(p.storage_path);
    if (error || !data) continue;
    const input = Buffer.from(await data.arrayBuffer());
    const jpeg = network === "instagram"
      ? await sharp(input).rotate().resize(1080, 1080, { fit: "contain", background: "#111111" }).jpeg({ quality: 86 }).toBuffer()
      : await sharp(input).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const path = `${requestId}/${network}-${i + 1}.jpg`;
    const up = await admin.storage.from("social-media").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (up.error) continue;
    out.push({ source: p.storage_path, path, url: admin.storage.from("social-media").getPublicUrl(path).data.publicUrl });
  }
  return out;
}
