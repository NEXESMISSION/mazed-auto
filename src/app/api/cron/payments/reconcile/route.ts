import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { secretMatches } from "@/lib/cron";
import { checkKonnectPayment } from "@/lib/payments/konnectCheck";
import { log } from "@/lib/log";

/**
 * GET /api/cron/payments/reconcile — the payments nobody told us about.
 *
 * A webhook can be lost and a buyer can close the tab before coming back. This
 * re-asks Konnect about every Konnect order still pending after 10 minutes,
 * with the same check as the webhook (a matching completed record captures it,
 * once). An order still unpaid a day later is closed as failed: Konnect's link
 * lasted 30 minutes. Everything it sees is in `payment_events`.
 *
 * Authenticated with CRON_SECRET, as a Bearer header (Vercel Cron) or ?key=.
 */
const MAX_PER_RUN = 50;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_secret_not_set" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("key") ?? "";
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: open } = await admin
    .from("payments")
    .select("id, amount, provider_ref, status, created_at")
    .eq("provider", "konnect")
    .eq("status", "pending")
    .lte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  const tally: Record<string, number> = {};
  for (const p of (open ?? []) as { id: string; amount: number; provider_ref: string | null; status: string; created_at: string }[]) {
    const outcome = await checkKonnectPayment(admin, p, "reconcile");
    tally[outcome] = (tally[outcome] ?? 0) + 1;
    if (outcome === "pending" && Date.now() - new Date(p.created_at).getTime() > 24 * 3600_000) {
      await admin
        .from("payments")
        .update({ status: "failed", admin_notes: "Non payé chez Konnect après 24 h" })
        .eq("id", p.id)
        .eq("status", "pending");
      tally.closed = (tally.closed ?? 0) + 1;
    }
  }

  log.scope("cron").info("payments reconcile", tally);
  return NextResponse.json({ ok: true, checked: open?.length ?? 0, ...tally });
}
