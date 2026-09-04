import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { log } from "@/lib/log";

/**
 * The user's profile photo.
 *
 * POST   → a signed upload URL for `<uid>/<stamp>.<ext>` in the avatars bucket
 * PATCH  → { path } once the bytes are in, saved onto profiles.avatar_path
 * DELETE → removes the photo and forgets the path
 *
 * Signed URL rather than the browser's supabase-js client, for the same reason
 * the receipt upload uses one: every supabase-js call that needs a token
 * serialises on a per-origin Web Lock, and one stalled auth call anywhere in
 * the app leaves the upload queued behind it with no request ever leaving the
 * browser. A plain fetch to a signed URL has no such dependency.
 *
 * The PATH is chosen here, never by the client, so a forged body cannot write
 * into someone else's folder.
 */

const SAFE_EXT = new Set(["webp", "jpg", "jpeg", "png", "avif"]);

async function requireUser(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return { error: NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 }) };
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "auth" }, { status: 401 }) };
  return { userId: user.id };
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw = String(body.ext ?? "webp").toLowerCase();
  const ext = SAFE_EXT.has(raw) ? raw : "webp";

  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  const path = `${gate.userId}/${Date.now()}.${ext}`;
  const { data, error } = await admin.storage.from("avatars").createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    log.scope("api").error("avatar signed-url failed", { msg: error?.message });
    return NextResponse.json({ error: "signed_url_failed" }, { status: 500 });
  }
  return NextResponse.json({ path, signedUrl: data.signedUrl });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireUser(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const path = typeof body.path === "string" ? body.path : "";
  // Only ever a file in the caller's own folder — the same rule the upload
  // enforces, restated here because this is what actually lands in the row.
  if (!path.startsWith(`${gate.userId}/`)) {
    return NextResponse.json({ error: "path_not_owned" }, { status: 403 });
  }

  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  // Whatever was there before is now unreferenced — remove it rather than
  // leaving a copy of the user's face in the bucket for ever.
  const { data: prev } = await admin
    .from("profiles").select("avatar_path").eq("id", gate.userId).maybeSingle();

  const { error } = await admin
    .from("profiles").update({ avatar_path: path }).eq("id", gate.userId);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  const old = prev?.avatar_path as string | null | undefined;
  if (old && old !== path) {
    void admin.storage.from("avatars").remove([old]);
  }
  return NextResponse.json({ ok: true, path });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req);
  if (gate.error) return gate.error;

  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  const { data: prev } = await admin
    .from("profiles").select("avatar_path").eq("id", gate.userId).maybeSingle();
  const { error } = await admin
    .from("profiles").update({ avatar_path: null }).eq("id", gate.userId);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  const old = prev?.avatar_path as string | null | undefined;
  if (old) void admin.storage.from("avatars").remove([old]);
  return NextResponse.json({ ok: true });
}
