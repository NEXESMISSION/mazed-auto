import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";

const handleI18n = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip i18n for non-localized routes (route handlers and the SW offline
  // shell). Run only the Supabase session refresh + auth gating on those.
  if (
    path.startsWith("/api/") ||
    path.startsWith("/auth/") ||
    path === "/sw.js"
  ) {
    return await updateSession(request);
  }

  // 1) Let next-intl decide locale routing first. If it issued a redirect
  //    (e.g. cookie/header → /fr/...), short-circuit so Supabase doesn't
  //    fight it with its own response.
  const intlResponse = handleI18n(request);
  if (
    intlResponse.status === 307 ||
    intlResponse.status === 308 ||
    intlResponse.headers.get("location")
  ) {
    return intlResponse;
  }

  // 2) Run the Supabase session refresh + auth gates. Then fold any cookies
  //    that next-intl set (e.g. NEXT_LOCALE) onto the auth response so the
  //    locale persists.
  const authResponse = await updateSession(request);
  intlResponse.cookies.getAll().forEach((c) => {
    authResponse.cookies.set(c.name, c.value);
  });
  // Preserve the rewrite header next-intl sets so the resolved locale
  // pathname reaches the page renderer.
  const rewrite = intlResponse.headers.get("x-middleware-rewrite");
  if (rewrite) authResponse.headers.set("x-middleware-rewrite", rewrite);
  return authResponse;
}

export const config = {
  matcher: [
    // Run on every request EXCEPT static assets, the SW, the manifest, the
    // metadata icons, and any image. The auth + locale check should only run
    // for actual app navigation.
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icon\\.png|apple-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
