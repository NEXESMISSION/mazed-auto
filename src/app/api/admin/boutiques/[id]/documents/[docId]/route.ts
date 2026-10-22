import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";

/**
 * GET /api/admin/boutiques/[id]/documents/[docId] — open one justificatif.
 *
 * The file lives in the private `shop-documents` bucket and never gets a
 * lasting link: this answers with a signed URL valid for 60 seconds (plan
 * §9), minted only for an admin, only for a document of THIS shop, and the
 * opening is logged.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; docId: string }> }) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { id, docId } = await ctx.params;
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { data: doc } = await admin
    .from("shop_documents")
    .select("id, shop_id, storage_path")
    .eq("id", docId)
    .maybeSingle();
  if (!doc || doc.shop_id !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await admin.storage.from("shop-documents").createSignedUrl(doc.storage_path as string, 60);
  if (error || !data?.signedUrl) return fail("document_unavailable", 404, error);

  logAction(req, gate.user, "admin.shop.document_opened", { id, docId });
  return NextResponse.redirect(data.signedUrl, 302);
}
