import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkKonnectPayment } from "@/lib/payments/konnectCheck";
import { overLimit } from "@/lib/http/rateLimit";
import { revealIpHash } from "@/lib/http/revealLimit";

/**
 * GET /api/payments/konnect/webhook?payment_ref=… — Konnect tells us a payment
 * changed. It tells us nothing else, and we believe nothing from it: the
 * reference is looked up in our own `payments` (unique per provider, 0188),
 * then Konnect is ASKED for that payment, and only a record that matches our
 * order — completed, TND, our order id, the full amount — is captured
 * (src/lib/payments/konnectCheck.ts). A webhook that arrives twice finds the
 * payment already captured and opens nothing more (recette 5).
 *
 * Konnect may call this from its servers, or send the buyer's browser here;
 * a browser is redirected to the order's status page, a server gets JSON.
 * Either way the answer is 200 for anything we understood — an unknown
 * reference included — so Konnect does not keep retrying a call we have
 * already logged.
 *
 * LIMITS. Konnect calls from its own few addresses, so a per-IP cap would end
 * up refusing real confirmations. Instead: an address may leave at most 30
 * « unknown reference » entries an hour (that is noise, not payments), and one
 * reference is looked up at Konnect at most 60 times an hour — anything past
 * that waits for the reconciliation job, which confirms it anyway.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("payment_ref") ?? req.nextUrl.searchParams.get("paymentRef");
  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  const wantsPage = (req.headers.get("accept") ?? "").includes("text/html");

  if (!ref || ref.length > 100) {
    return NextResponse.json({ ok: false, outcome: "bad_request" }, { status: 400 });
  }

  const { data: pay } = await admin
    .from("payments")
    .select("id, amount, provider_ref, status, shop_id")
    .eq("provider", "konnect")
    .eq("provider_ref", ref)
    .maybeSingle();

  if (!pay) {
    if (!(await overLimit(admin, `konnect_unknown:${revealIpHash(req)}`, 30, 3600))) {
      await admin.from("payment_events").insert({
        provider: "konnect", provider_ref: ref, source: "webhook", outcome: "unknown_ref",
      });
    }
    return NextResponse.json({ ok: true, outcome: "unknown_ref" });
  }

  const deferred = pay.status !== "captured" && (await overLimit(admin, `konnect_ref:${ref}`, 60, 3600));
  const outcome = deferred ? "deferred" : await checkKonnectPayment(
    admin,
    pay as { id: string; amount: number; provider_ref: string; status: string },
    "webhook",
  );

  if (wantsPage) {
    const page = pay.shop_id ? "/fr/pro/dashboard/abonnement" : "/fr/account/listings";
    return NextResponse.redirect(new URL(`${page}?payment=${pay.id}`, req.url), 303);
  }
  return NextResponse.json({ ok: true, outcome });
}
