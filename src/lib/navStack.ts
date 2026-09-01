/**
 * In-app navigation stack powering the TopBar back button.
 *
 * The button used to always `push("/")`. Reliable, but useless: three taps
 * into a listing, "back" threw you to the home page instead of the page you
 * came from.
 *
 * The obvious fix — `router.back()` — is what creates the loops:
 * several of our routes bounce you forward again the moment you land on
 * them, so the previous history entry is not somewhere you can actually
 * stand. `/login` reached via the middleware account-gate is the clearest
 * case: going back to `/account/payments` re-triggers the gate, which
 * redirects to `/login`, and the two ping-pong forever. Same shape for the
 * KYC wizard (kyc-gate bounces in-flight users to `/kyc/status`) and for the
 * inspector routes (gated off entirely right now).
 *
 * So we keep our OWN stack of visited paths and decide where back goes:
 *
 *   1. Walk the stack backwards, skipping the current page and any route
 *      that would just redirect again (`isTransient`).
 *   2. Navigate with `push`, not `history.back()`. The browser's history
 *      still holds the redirect entries we skipped; replaying it would walk
 *      straight back into them. Pushing a chosen destination is the whole
 *      anti-loop mechanism.
 *   3. Truncate the stack to the target so repeated taps keep walking
 *      backwards instead of ping-ponging between the last two pages.
 *   4. Nothing usable in the stack (deep-link, fresh tab, everything
 *      transient) → an explicit hierarchical parent, and only then home.
 *
 * Paths here are locale-less — exactly what next-intl's `usePathname`
 * returns and what its `router.push` expects.
 */

export const NAV_STACK_KEY = "mz:navstack";

/** Bounded so a long session can't grow sessionStorage without limit. */
export const MAX_STACK = 25;

/**
 * Routes that are never a valid "back" destination because landing on them
 * re-runs a gate that moves you somewhere else. Returning to one of these is
 * exactly the loop the plain browser-back suffers from.
 */
const TRANSIENT_PREFIXES = [
  // Auth surfaces — the middleware auth-gate bounces signed-in users off
  // them, and they are typically reached BY a redirect in the first place.
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  // KYC wizard — kyc-gate redirects in-flight/verified users to /kyc/status,
  // and the wizard carries its own step-aware back affordance anyway.
  "/kyc",
  // Payment flow — a finished or abandoned checkout should not be re-entered
  // by a back tap; /payment/success and /failed are terminal screens.
  "/payment",
  // Inspector network: gated off entirely, so every one of these 307s home.
  "/inspector",
  "/inspectors",
  "/account/inspections",
  "/admin/inspectors",
  // Service-worker offline shell — never a real destination.
  "/offline",
];

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isTransient(path: string): boolean {
  return matchesPrefix(path, TRANSIENT_PREFIXES);
}

/** The sign-in surfaces. Standing on one is strong evidence of no session. */
const AUTH_SURFACES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function isAuthSurface(path: string): boolean {
  return matchesPrefix(path, AUTH_SURFACES);
}

/**
 * Routes that bounce a signed-OUT visitor to /login (middleware account-gate,
 * the admin guard, the seller/partner dashboards).
 *
 * These are perfectly good back destinations for a signed-in user, so they are
 * NOT transient in general — we only skip them when backing out of an auth
 * surface, where the user is almost certainly signed out and returning would
 * bounce straight back to /login. That bounce is the loop this whole module
 * exists to avoid, and it is the one case where we can infer session state
 * from the URL alone.
 */
const AUTH_GATED_PREFIXES = ["/account", "/admin", "/sell", "/partners"];

export function requiresAuth(path: string): boolean {
  return matchesPrefix(path, AUTH_GATED_PREFIXES);
}

/**
 * Explicit parent rules. Deliberately NOT "drop the last URL segment":
 * that guesses routes which may not exist and would land the user on a 404.
 * Every parent below is a real page in src/app/[locale].
 */
const PARENT_RULES: { test: RegExp; parent: string }[] = [
  // NB: /auctions/<id>/bid is handled ahead of these in parentPath().
  { test: /^\/auctions\/[^/]+\/?$/, parent: "/auctions" },
  { test: /^\/properties\/[^/]+\/?$/, parent: "/properties" },
  { test: /^\/account\/[^/]+(\/.*)?$/, parent: "/account" },
  { test: /^\/admin\/.+/, parent: "/admin" },
  { test: /^\/sell\/[^/]+\/?$/, parent: "/sell" },
  { test: /^\/partners\/.+/, parent: "/partners" },
];

/**
 * Hierarchical fallback when the stack yields nothing — a deep link, a fresh
 * tab, or a history made entirely of gate routes. Returns null when there is
 * no sensible parent, letting the caller fall through to home.
 */
export function parentPath(path: string): string | null {
  // A bid screen's parent is its own auction, not the catalogue.
  const bid = path.match(/^(\/auctions\/[^/]+)\/bid\/?$/);
  if (bid) return bid[1];

  for (const rule of PARENT_RULES) {
    if (rule.test.test(path)) return rule.parent;
  }
  return null;
}

/**
 * Append `path` to the stack.
 *
 * A repeat of the current head is ignored — that is what a back navigation
 * looks like to the tracker (we truncated to the target, then pushed it), and
 * re-appending it would undo the truncation and reintroduce the ping-pong.
 */
export function pushPath(stack: string[], path: string): string[] {
  if (stack.length > 0 && stack[stack.length - 1] === path) return stack;
  return [...stack, path].slice(-MAX_STACK);
}

export interface BackTarget {
  /** Where to send the user. */
  target: string;
  /** Stack to persist before navigating, already truncated to the target. */
  nextStack: string[];
}

/**
 * Decide where a back tap goes, and what the stack should look like after.
 */
export function resolveBack(stack: string[], current: string): BackTarget {
  // Backing out of /login etc. means there is (almost certainly) no session,
  // so auth-gated destinations behind us would redirect us right back here.
  const leavingAuthGate = isAuthSurface(current);

  for (let i = stack.length - 1; i >= 0; i--) {
    const candidate = stack[i];
    if (candidate === current) continue;
    if (isTransient(candidate)) continue;
    if (leavingAuthGate && requiresAuth(candidate)) continue;
    // Truncate THROUGH the target so the next tap continues backwards from
    // there rather than bouncing between these two pages.
    return { target: candidate, nextStack: stack.slice(0, i + 1) };
  }
  // Nothing in history we can stand on.
  return { target: parentPath(current) ?? "/", nextStack: [] };
}

// ── sessionStorage I/O ──────────────────────────────────────────────────
// Per-tab by design: two tabs should not share a back stack. Every access is
// guarded — Safari private mode and "block site data" throw on access rather
// than returning null.

export function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function writeStack(stack: string[]): void {
  try {
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack));
  } catch {
    // Storage unavailable — the button still works, it just falls back to the
    // hierarchical parent instead of true history.
  }
}
