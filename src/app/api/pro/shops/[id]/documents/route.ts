import { NextRequest, NextResponse } from "next/server";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/pro/shops/[id]/documents — the justificatifs that earn the
 * « Boutique vérifiée » badge.
 *
 *   { action: "upload_url", ext }          → { path, signedUrl } in the PRIVATE
 *                                            `shop-documents` bucket
 *   { action: "submit", kind, path }       → records the document and asks for
 *                                            verification (`pending`)
 *
 * The bucket is private and has no read policy: nobody reads these files but
 * the service role, which is how an admin will review them (signed URLs that
 * last a minute). Asking for verification is the one state change an owner
 * may make — `_guard_shop_state` (0185) allows unverified/rejected → pending
 * and nothing further.
 */
const EXTS = new Set(["pdf", "jpg", "jpeg", "png"]);
const KINDS = new Set(["rne", "patente", "cin_gerant", "autre"]);
const MAX_DOCUMENTS = 10;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireShopRole(req, id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;
  const { user, admin } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown; ext?: unknown; kind?: unknown; path?: unknown;
  };

  if (body.action === "upload_url") {
    const ext = typeof body.ext === "string" && EXTS.has(body.ext.toLowerCase()) ? body.ext.toLowerCase() : null;
    if (!ext) {
      return NextResponse.json({ error: "bad_type", detail: "PDF, JPEG ou PNG uniquement." }, { status: 400 });
    }
    const path = `shops/${id}/doc-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { data, error } = await admin.storage.from("shop-documents").createSignedUploadUrl(path);
    if (error || !data?.signedUrl) return fail("signed_url_failed", 500, error);
    return NextResponse.json({ path, signedUrl: data.signedUrl });
  }

  if (body.action === "submit") {
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
    const path = typeof body.path === "string" ? body.path : "";
    const inFolder = path.startsWith(`shops/${id}/doc-`) && !path.includes("..") && /^[A-Za-z0-9/_.-]+$/.test(path);
    if (!kind || !inFolder) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    const { count } = await admin
      .from("shop_documents")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", id);
    if ((count ?? 0) >= MAX_DOCUMENTS) {
      return NextResponse.json({ error: "too_many", detail: "Dix justificatifs au plus." }, { status: 400 });
    }

    // The file must really be there: a recorded document that points at
    // nothing would sit in the admin's queue as an empty promise.
    const folder = `shops/${id}`;
    const name = path.slice(folder.length + 1);
    const { data: found } = await admin.storage.from("shop-documents").list(folder, { search: name, limit: 1 });
    if (!found || found.length === 0) {
      return NextResponse.json({ error: "file_missing", detail: "Le fichier n'a pas été reçu." }, { status: 400 });
    }

    const { error } = await admin.from("shop_documents").insert({ shop_id: id, kind, storage_path: path });
    if (error) return fail("document_save_failed", 500, error);

    const { data: shop } = await admin.from("shops").select("verification_status").eq("id", id).maybeSingle();
    if (shop && ["unverified", "rejected"].includes(shop.verification_status as string)) {
      await admin.from("shops").update({ verification_status: "pending" }).eq("id", id);
    }

    logAction(req, user, "shop.document.submit", { shopId: id, kind });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
