import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { logAction } from "@/lib/activity";
import { fail } from "@/lib/http/errors";
import { INSPECTIONS_ENABLED } from "@/lib/features";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Feature-gated — middleware's matcher excludes /api, so gate here. 404s
  // while the inspector network is off; approving into a hidden surface
  // would silently elevate a profile's role with nowhere to use it.
  if (!INSPECTIONS_ENABLED) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const gate = await requireAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { user, supabase } = gate;
  const { id } = await ctx.params;

  // Approve atomically: the RPC flips inspectors.approved AND profiles.role
  // in one transaction (migration 0128). Doing them as two separate updates
  // risked a half-elevated inspector (approved in the table but still
  // role='individual' everywhere RLS/guards check) if the second write failed.
  // Runs on the user client so auth.uid() is the admin and is_admin() resolves.
  const { error } = await supabase.rpc("admin_approve_inspector", { p_id: id });
  if (error) {
    const msg = error.message || "";
    const [code, st] =
      msg.includes("inspector_not_found") ? ["inspector_not_found", 404] as const
      : msg.includes("profile_not_found") ? ["profile_not_found", 404] as const
      : msg.includes("forbidden") ? ["forbidden", 403] as const
      : ["inspector_approve_failed", 500] as const;
    return fail(code, st, error);
  }

  // Notify the new inspector.
  const admin = getServiceSupabase();
  if (admin) {
    await admin.rpc("enqueue_notification", {
      p_user_id: id,
      p_kind: "inspector_approved",
      p_title: "Vous êtes approuvé comme inspecteur",
      p_body: "Votre compte inspecteur a été validé. Vous pouvez désormais accepter des missions sur Mazed Auto.",
      p_link: "/inspector",
    });
  }

  logAction(req, user, "inspector.approved", { inspectorId: id });
  return NextResponse.json({ ok: true });
}
