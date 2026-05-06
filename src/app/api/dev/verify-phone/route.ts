import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * DEV-ONLY: marks the current user's phone as verified without an SMS provider.
 * Called from /verify-phone in development to unblock the KYC flow when no
 * Twilio/Supabase SMS is configured.
 *
 * In production this route refuses (404) — never ship a way to fake phone
 * verification for prod users.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Identify the caller from the auth cookie
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only here
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { phone?: string };

  // Use the service-role client to update auth.users — admin-only fields.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Setting phone + phone_confirm:true on updateUserById flips
  // phone_confirmed_at to now() and stores the phone on the user row.
  const phone =
    body.phone ||
    (user.user_metadata as { phone?: string } | null)?.phone ||
    user.phone ||
    "+216" + Math.floor(20000000 + Math.random() * 80000000); // fallback

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    phone,
    phone_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
