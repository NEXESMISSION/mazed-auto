import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback. Exchanges the `code` for a session and
 * redirects to `next` (or `/`). On any failure path — missing code,
 * exchange error — we redirect to /login with `?error=...` so the
 * login page can surface the reason via toast. Earlier this route
 * just sent `?error=callback` with no detail, leaving users stuck
 * with no feedback after a failed Google sign-in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=callback`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const reason = encodeURIComponent(error.message || "callback");
    return NextResponse.redirect(`${url.origin}/login?error=${reason}`);
  }
  return NextResponse.redirect(`${url.origin}${next}`);
}
