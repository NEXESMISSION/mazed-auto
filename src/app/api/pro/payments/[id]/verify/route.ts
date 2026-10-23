import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { fail } from "@/lib/http/errors";
import { checkKonnectPayment } from "@/lib/payments/konnectCheck";
import { overLimit, tooMany } from "@/lib/http/rateLimit";

/**
 * POST /api/pro/payments/[id]/verify — the buyer is back from Konnect: where
 * does their payment stand?
 *
 * Coming back to a « success » URL proves nothing (recette 6), so this does
 * exactly what the webhook does — asks Konnect, captures only on a matching
 * completed record — and answers with the payment's state. For a transfer it
 * only reads the state: an admin captures those.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const admin = getServiceSupabase();
  if (!admin) return fail("server_misconfigured", 500);
  if (await overLimit(admin, `pay_verify:${user.id}`, 60, 3600)) return tooMany();

  const { data: pay } = await admin
    .from("payments")
    .select("id, user_id, provider, provider_ref, amount, status")
    .eq("id", id)
    .maybeSingle();
  if (!pay || pay.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (pay.provider === "konnect" && (pay.status === "pending" || pay.status === "pending_review")) {
    await checkKonnectPayment(
      admin,
      pay as { id: string; amount: number; provider_ref: string | null; status: string },
      "return",
    );
  }

  const { data: now } = await admin.from("payments").select("status, kind, receipt_number").eq("id", id).single();
  return NextResponse.json({ status: now?.status, kind: now?.kind, receipt: now?.receipt_number ?? null });
}
