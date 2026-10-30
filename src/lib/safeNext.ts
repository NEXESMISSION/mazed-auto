/**
 * A `next` path taken from the query string, kept only when it stays on this
 * site. Shared by the middleware (signed-in visitor on /login) and the login
 * form, so the two can never disagree.
 *
 * Refused, because a browser or `new URL()` would leave the site with them:
 *   - anything not starting with a single `/` (`//evil.com`, `https:…`);
 *   - a backslash anywhere (`/\evil.com` is read as `//evil.com`);
 *   - control characters and whitespace — the URL parser strips tabs and
 *     newlines, so `/\t/evil.com` becomes `//evil.com`;
 *   - a scheme after leading slashes (`/javascript:…`).
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return fallback;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  return raw;
}
