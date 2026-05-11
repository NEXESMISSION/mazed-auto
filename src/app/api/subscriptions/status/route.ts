// Lightweight polling endpoint for /payment/return — returns the
// current status of a pending subscription owned by the caller. Also
// triggers a verification round-trip in simulation mode (the
// "webhook" never arrives, so the return page asks us to settle it).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const subId = request.nextUrl.searchParams.get("sub");
  const simulated = request.nextUrl.searchParams.get("simulated") === "1";
  if (!subId) {
    return NextResponse.json(
      { ok: false, error: "missing sub" },
      { status: 400 },
    );
  }

  const supa = await createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  // Simulation path: complete the subscription on this request. The
  // RPC already enforces ownership and is idempotent, so spamming the
  // endpoint is safe.
  if (simulated) {
    await supa.rpc("complete_subscription_from_payment", {
      p_subscription_id: subId,
      p_provider_ref: `SIM-${subId.slice(0, 8)}`,
    });
  }

  const { data, error } = await supa
    .rpc("get_my_subscription_status", { p_subscription_id: subId })
    .maybeSingle<{
      status: string;
      plan_name: string;
      activated_at: string | null;
      failed_at: string | null;
      failed_reason: string | null;
    }>();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, ...data });
}
