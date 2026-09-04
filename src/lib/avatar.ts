/**
 * Public URL for a profile photo stored in the `avatars` bucket (0170).
 *
 * Rows store the PATH, not a URL, so the bucket can move or sit behind a CDN
 * without rewriting every profile. Everything that renders a face goes through
 * here so there is one place to change when it does.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}
