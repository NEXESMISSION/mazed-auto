import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback. Exchanges the `code` for a session and
 * redirects to `next` (or `/`). On any failure path — missing code,
 * exchange error — we redirect to /login with `?error=...` so the
 * login page can surface the reason via toast.
 */

/**
 * Open-redirect guard. `next` arrives as a URL search-param, so an
 * attacker could craft `/auth/callback?code=...&next=https://evil.com`
 * and the post-OAuth redirect would land the user on their site after
 * they've just signed in — a perfect phishing setup (audit finding #3).
 *
 * Only accept values that:
 *   - start with a single `/`
 *   - are not protocol-relative (`//evil.com/…` → `https://evil.com/…`)
 *   - have no backslash that some user agents normalise to `/`
 *
 * Anything else falls back to "/".
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("\\")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

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
