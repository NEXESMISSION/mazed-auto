/**
 * Which bottom-bar tab a path belongs to.
 *
 * This lives apart from the component because the bar broke in a way that
 * rendering could not catch: the "Activité" tab was repointed to
 * `/account/listings` during the pivot while its matcher still tested the old
 * `/account/activity`, so it navigated somewhere it did not recognise and
 * never lit up — and the Compte tab's `startsWith("/account/")` quietly
 * claimed the highlight instead. Both halves looked fine on their own.
 *
 * So the rule is a pure function over the pathname, `activeTabFor` resolves
 * exactly one winner by order, and the tests assert the two invariants that
 * were violated: every tab lights for its own href, and no path lights two.
 */

export type TabId = "home" | "browse" | "sell" | "activity" | "account";

/** Locale-less pathnames, as `usePathname` from `@/i18n/navigation` returns. */
export const TAB_HREFS: Record<TabId, string> = {
  home: "/",
  browse: "/annonces",
  sell: "/annonces/nouvelle",
  activity: "/account/listings",
  account: "/account",
};

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/**
 * What "Activité" covers: the seller's own annonces, plus the legacy activity
 * page while it is still routed. Named because Compte has to defer to it.
 */
const ACTIVITY_PATHS = ["/account/listings", "/account/activity"];

export const isActivityPath = (p: string) => ACTIVITY_PATHS.some((b) => under(p, b));

const isSellPath = (p: string) => under(p, "/annonces/nouvelle") || under(p, "/sell");

/**
 * The matchers are disjoint on purpose — each excludes what a neighbour owns,
 * rather than relying on being listed first. `/annonces/nouvelle` sits under
 * `/annonces`, so ordering alone would light the catalog tab for the sell
 * wizard the moment anyone reordered this array.
 */
export const TAB_MATCHERS: { id: TabId; match: (p: string) => boolean }[] = [
  { id: "home", match: (p) => p === "/" },
  { id: "sell", match: isSellPath },
  {
    // The catalog. /properties and /auctions are v2 surfaces with no entry
    // point left in the app (PIVOT-PLAN.md Phase 6 deletes them); they stay
    // here only so a stale bookmark still lights the right tab meanwhile.
    id: "browse",
    match: (p) =>
      !isSellPath(p) &&
      (under(p, "/annonces") || under(p, "/properties") || under(p, "/auctions")),
  },
  { id: "activity", match: isActivityPath },
  {
    id: "account",
    match: (p) =>
      // Whatever Activité owns is not Compte's — this exclusion is the bug
      // that made "Mes annonces" light the account tab instead.
      !isActivityPath(p) &&
      (under(p, "/account") ||
        p === "/login" ||
        p === "/signup" ||
        under(p, "/payment") ||
        under(p, "/partners") ||
        under(p, "/admin")),
  },
];

/** The single tab to highlight for a path, or null if none owns it. */
export function activeTabFor(pathname: string): TabId | null {
  return TAB_MATCHERS.find((t) => t.match(pathname))?.id ?? null;
}
