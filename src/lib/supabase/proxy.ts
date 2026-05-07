import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Each prefix matches "/x" exactly OR "/x/anything"; without the trailing
// slash discipline, "/seller" would also match the public "/sellers" listing.
const PROTECTED_PREFIXES = [
  "/seller/",
  "/buyer/",
  "/admin/",
  "/settings/",
  "/notifications/",
  "/transactions/",
  "/kyc/",
  "/payment/",
];

// Pages that require auth as exact paths (not prefixes). `/profile` itself is
// the user's own profile and needs login, but `/profile/<username>` is a
// public seller profile so we can't gate the whole prefix. Also list the
// bare /seller, /buyer, etc. paths since the prefixes above only match the
// trailing-slash forms.
const PROTECTED_EXACT = [
  "/profile",
  "/seller",
  "/buyer",
  "/admin",
  "/settings",
  "/notifications",
  "/transactions",
  "/kyc",
  "/payment",
];

const AUTH_ONLY_PAGES = ["/login", "/register", "/forgot-password"];

export async function updateSession(request: NextRequest) {
  // Next.js fires a prefetch on every visible Link. We don't need to refresh
  // tokens or evaluate gates for those — the user hasn't actually navigated.
  // Short-circuiting here saves ~500ms per hovered link.
  const isPrefetch =
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch";
  if (isPrefetch) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Strip the locale prefix (with localePrefix:"always" both /ar and /fr
  // are present) so the gate logic stays locale-agnostic. The path the
  // gates check is always the unprefixed page path.
  const rawPath = request.nextUrl.pathname;
  const localeMatch = rawPath.match(/^\/(ar|fr)(\/.*|$)/);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";
  const path = localeMatch ? localeMatch[2] || "/" : rawPath;

  const isProtected =
    PROTECTED_PREFIXES.some((p) => path.startsWith(p)) ||
    PROTECTED_EXACT.includes(path);
  const isAuthOnly = AUTH_ONLY_PAGES.includes(path);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix}/login`;
    url.searchParams.set("redirect", rawPath);
    return NextResponse.redirect(url);
  }

  // Admin gate — only users whose JWT user_metadata.role === 'admin' may
  // see /admin/*. Everyone else gets bounced home.
  if (path.startsWith("/admin") && user) {
    const role = (user.user_metadata as { role?: string } | null)?.role;
    if (role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = localePrefix || "/";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthOnly && user) {
    const url = request.nextUrl.clone();
    url.pathname = localePrefix || "/";
    return NextResponse.redirect(url);
  }

  return response;
}
