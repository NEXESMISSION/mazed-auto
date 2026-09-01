import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { log } from "@/lib/log";

/**
 * Signed upload URLs for a payment's receipts.
 *
 * WHY this exists instead of the browser uploading with supabase-js:
 *
 * Every supabase-js call that needs an access token — `storage.upload()`
 * included — goes through the auth client, which serialises on a Web Locks
 * lock named `lock:sb-<ref>-auth-token`. That lock is per-ORIGIN, so it is
 * shared with every other tab the user has open on the site. One stalled
 * auth operation anywhere (a backgrounded tab, a request that never settles
 * on a flaky mobile connection) leaves the lock held, and every later call
 * queues behind it forever. Observed on the checkout page: the lock held by
 * one client with four operations queued, no HTTP request ever leaving the
 * browser, and the receipt upload reported as "Connexion trop lente" after
 * its timeout — for a transfer that takes ~400 ms when it actually runs.
 *
 * A signed URL removes the browser's auth client from the path completely:
 * this route mints the URL server-side (where the session is a cookie, not a
 * lock), and the browser PUTs the bytes with a plain `fetch` — which also
 * gives it a real AbortSignal, so the send can be timed out and cancelled
 * for real.
 *
 * The PATH is chosen here, never by the client: `<userId>/<paymentId>-…`,
 * matching the owner-scoped storage RLS (0023/0024). A forged body can't
 * write outside the caller's own folder.
 *
 * POST   { count: number, exts: string[] } → { uploads: [{ path, signedUrl }] }
 * DELETE { paths: string[] }               → removes orphans from a failed send
 */

const MAX_RECEIPTS = 3;
const SAFE_EXT = /^[a-z0-9]{1,5}$/;

async function authorize(req: NextRequest, paymentId: string) {
  if (!isSameOrigin(req)) {
    return { error: NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 }) };
  }
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "auth" }, { status: 401 }) };
  }
  // Ownership + state, under the caller's own RLS: a payment id belonging to
  // someone else simply doesn't come back.
  const { data: pay } = await supabase
    .from("payments")
    .select("id, user_id, status")
    .eq("id", paymentId)
    .single();
  if (!pay || pay.user_id !== user.id) {
    return { error: NextResponse.json({ error: "payment_not_found" }, { status: 404 }) };
  }
  if (pay.status !== "pending" && pay.status !== "pending_review") {
    return {
      error: NextResponse.json(
        { error: "payment_already_resolved", status: pay.status },
        { status: 409 },
      ),
    };
  }
  return { userId: user.id };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: paymentId } = await ctx.params;
  const gate = await authorize(req, paymentId);
  if (gate.error) return gate.error;
  const userId = gate.userId!;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const rawExts: unknown[] = Array.isArray(body.exts) ? body.exts : [];
  const exts = rawExts
    .map((e) => String(e ?? "").toLowerCase())
    .map((e) => (SAFE_EXT.test(e) ? e : "bin"))
    .slice(0, MAX_RECEIPTS);
  if (exts.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const safePid = paymentId.replace(/[^a-z0-9-]/gi, "");
  const stamp = Date.now();
  const uploads: { path: string; signedUrl: string }[] = [];
  for (let i = 0; i < exts.length; i++) {
    const path = `${userId}/${safePid}-${stamp}-${i}.${exts[i]}`;
    const { data, error } = await admin.storage
      .from("receipts")
      .createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      log.scope("api").error("receipt signed-url failed", { msg: error?.message });
      return NextResponse.json({ error: "signed_url_failed" }, { status: 500 });
    }
    uploads.push({ path, signedUrl: data.signedUrl });
  }

  return NextResponse.json({ uploads });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: paymentId } = await ctx.params;
  const gate = await authorize(req, paymentId);
  if (gate.error) return gate.error;
  const userId = gate.userId!;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw: unknown[] = Array.isArray(body.paths) ? body.paths : [];
  // Only ever the caller's own folder — the same rule the upload path enforces.
  const paths = raw
    .filter((p): p is string => typeof p === "string" && p.startsWith(`${userId}/`))
    .slice(0, MAX_RECEIPTS);
  if (paths.length === 0) return NextResponse.json({ ok: true, removed: 0 });

  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  // Service role: the receipts bucket has no DELETE policy for `authenticated`
  // (0024 shipped select+insert only), which is why the old client-side
  // cleanup was a silent no-op and every failed send left an orphan behind.
  const { error } = await admin.storage.from("receipts").remove(paths);
  if (error) {
    log.scope("api").error("receipt cleanup failed", { msg: error.message });
    return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: paths.length });
}
