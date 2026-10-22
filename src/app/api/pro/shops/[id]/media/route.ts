import { NextRequest, NextResponse } from "next/server";
import { requireShopRole } from "@/lib/shops/routeGuard";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { fail } from "@/lib/http/errors";

/**
 * POST /api/pro/shops/[id]/media — a signed upload URL for the shop's logo or
 * banner, in the public `shop-media` bucket.
 *
 * Same pattern as annonce photos (/api/annonces/photo-url): the server picks
 * the path — `shops/<id>/<kind>-<stamp>.<ext>` — so a forged body cannot write
 * outside this shop's folder, and the bucket itself refuses anything that is
 * not a JPEG, PNG or WebP under 5 MB (0185). The browser then PUTs the bytes
 * and saves the path through POST /api/pro/shops/[id], which checks the folder
 * again.
 *
 * POST { kind: "logo" | "banner", ext } → { path, signedUrl }
 */
const EXTS = new Set(["webp", "jpg", "jpeg", "png"]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gate = await requireShopRole(req, id, CAN_EDIT_SHOP);
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; ext?: unknown };
  const kind = body.kind === "banner" ? "banner" : body.kind === "logo" ? "logo" : null;
  if (!kind) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ext = typeof body.ext === "string" && EXTS.has(body.ext.toLowerCase()) ? body.ext.toLowerCase() : "webp";

  const path = `shops/${id}/${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { data, error } = await gate.admin.storage.from("shop-media").createSignedUploadUrl(path);
  if (error || !data?.signedUrl) return fail("signed_url_failed", 500, error);
  return NextResponse.json({ path, signedUrl: data.signedUrl });
}
