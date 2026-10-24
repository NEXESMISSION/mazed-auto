/**
 * The site's messages are split in two:
 *
 *   - messages/<locale>.json — the core: the bars, the account menu, the auth
 *     pages, the words every page may need. Always sent to the browser.
 *   - messages/<area>/<locale>.json — one file per part of the site, loaded as
 *     the namespace `<area>` (`useTranslations("catalog")`…).
 *
 * The server sees everything. The BROWSER only receives the core, the areas in
 * GLOBAL_CLIENT_AREAS (used by components that appear on any page), and the
 * areas a route asks for with <AreaMessages> in its layout. Sending all of it
 * to every page would add tens of kilobytes of text — the admin console's
 * included — to the payload of a page that uses a dozen strings.
 */
export const AREAS = [
  "social",
  // Public site
  "homePage",
  "info",
  "legal",
  "shared",
  "catalog",
  "listing",
  "publish",
  "uploader",
  "myAccount",
  "notifications",
  "payment",
  "shops",
  "pro",
  // Admin console
  "admin",
  "adminOps",
] as const;

export type Area = (typeof AREAS)[number];

/** Areas whose client components can show up on any page. */
export const GLOBAL_CLIENT_AREAS: readonly Area[] = ["shared", "uploader", "notifications"];

type Messages = Record<string, unknown>;

/** The part of `messages` a browser needs: the core, the global areas, and `areas`. */
export function clientMessages(messages: Messages, areas: readonly Area[] = []): Messages {
  const keep = new Set<string>([...GLOBAL_CLIENT_AREAS, ...areas]);
  const all = new Set<string>(AREAS);
  return Object.fromEntries(Object.entries(messages).filter(([k]) => !all.has(k) || keep.has(k)));
}
