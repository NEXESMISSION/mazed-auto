import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import {
  normalizePhotos,
  normalizeSections,
  normalizeVerdict,
  type DiagnosticStatus,
} from "@/lib/diagnostics";

/**
 * PUT /api/admin/diagnostics/<propertyId> — write the Mazed diagnostic sheet.
 *
 * Admin-only, one row per property (upsert on property_id). The body is the
 * whole document; every field is re-normalised here, so a malformed section or
 * an over-long note can never reach a public page. `published_at` is stamped by
 * the DB trigger (0148), never by the client.
 *
 * DELETE removes the sheet entirely — which also removes the badge, since the
 * badge is rendered from the row's existence + status.
 */

type Body = {
  status?: unknown;
  verdict?: unknown;
  headline?: unknown;
  summary?: unknown;
  sections?: unknown;
  photos?: unknown;
  inspector_name?: unknown;
  inspected_at?: unknown;
};

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const { propertyId: subjectId } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  // The id may be a v3 listing or a v2 property — one route, because a
  // diagnostic is the same document either way and the admin should not have to
  // know which era they are looking at. Listings are checked first: that is the
  // catalog now.
  const { data: listing } = await admin
    .from("listings").select("id").eq("id", subjectId).maybeSingle();
  const { data: prop } = listing
    ? { data: null }
    : await admin.from("properties").select("id").eq("id", subjectId).maybeSingle();
  if (!listing && !prop) {
    return NextResponse.json({ error: "subject_not_found" }, { status: 404 });
  }
  const subject: { listing_id: string | null; property_id: string | null } = listing
    ? { listing_id: subjectId, property_id: null }
    : { listing_id: null, property_id: subjectId };
  const conflictKey = listing ? "listing_id" : "property_id";

  const body = (await req.json().catch(() => ({}))) as Body;
  const status: DiagnosticStatus = body.status === "published" ? "published" : "draft";

  let inspectedAt: string | null = null;
  if (typeof body.inspected_at === "string" && body.inspected_at.trim()) {
    const d = new Date(body.inspected_at);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "invalid_date", key: "inspected_at" }, { status: 400 });
    }
    inspectedAt = d.toISOString();
  }

  const payload = {
    ...subject,
    status,
    verdict: normalizeVerdict(body.verdict),
    headline: str(body.headline, 160),
    summary: str(body.summary, 4000),
    sections: normalizeSections(body.sections),
    photos: normalizePhotos(body.photos),
    inspector_name: str(body.inspector_name, 120),
    inspected_at: inspectedAt,
    updated_by: user.id,
  };

  // A published sheet with nothing in it is worse than no badge: it promises a
  // check we can't show. Require something a buyer can actually read.
  if (
    status === "published" &&
    payload.sections.length === 0 &&
    !payload.summary &&
    payload.photos.length === 0
  ) {
    return NextResponse.json(
      {
        error: "diagnostic_empty",
        detail: "Ajoutez au moins un contrôle, une photo ou un résumé avant de publier.",
      },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("vehicle_diagnostics")
    .upsert(payload, { onConflict: conflictKey });
  if (error) return fail("diagnostic_save_failed", 500, error);

  logAction(req, user, "admin.diagnostic.save", { subjectId, status });
  return NextResponse.json({ ok: true, status });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
) {
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;
  const { propertyId: subjectId } = await ctx.params;

  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);

  const { error } = await admin
    .from("vehicle_diagnostics")
    .delete()
    .or(`listing_id.eq.${subjectId},property_id.eq.${subjectId}`);
  if (error) return fail("diagnostic_delete_failed", 500, error);

  logAction(req, user, "admin.diagnostic.delete", { subjectId });
  return NextResponse.json({ ok: true });
}
