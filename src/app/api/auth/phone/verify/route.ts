import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/sameOrigin";
import { clientIp } from "@/lib/clientIp";
import { hashCode, hashProof, newOtpProof } from "@/lib/otp";

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/phone/verify — check a phone OTP.
 *
 * Body: { phone: "+216…", code: "123456" }
 * 200 { ok:true } on success (code is single-use — the row is deleted).
 * 400 on wrong/expired/missing code; 429 after too many attempts.
 *
 * Constant set of error codes so it doesn't leak whether the number exists.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
  }
  const ip = clientIp(req);

  let phone = "";
  let code = "";
  try {
    const body = (await req.json()) as { phone?: unknown; code?: unknown };
    if (typeof body.phone === "string") phone = body.phone.trim();
    if (typeof body.code === "string") code = body.code.replace(/\D/g, "");
  } catch {
    /* fall through to 400 */
  }
  if (!/^\+\d{8,15}$/.test(phone) || code.length !== 6) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const admin = getServiceSupabase();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Per-IP throttle (cross-instance): the per-number attempt cap below does not
  // stop an attacker brute-forcing codes across many numbers from one IP.
  const { data: ipBlocked } = await admin.rpc("check_auth_ratelimit", { p_ip: ip });
  if (ipBlocked === true) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // One locked step in the database (0199): expiry, the attempt counter and
  // the comparison happen under a row lock, so parallel guesses are counted
  // one by one instead of all reading the same count. A correct code earns a
  // one-time proof that only this response carries; signup and password reset
  // must present it, so a « verified » phone is useless to anyone else.
  const proof = newOtpProof();
  const { data: outcome, error } = await admin.rpc("phone_otp_try", {
    p_phone: phone,
    p_code_hash: hashCode(phone, code),
    p_proof_hash: hashProof(phone, proof),
    p_max: MAX_ATTEMPTS,
  });
  if (error) return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  if (outcome === "ok") return NextResponse.json({ ok: true, proof });
  const status = outcome === "too_many_attempts" ? 429 : 400;
  return NextResponse.json({ error: outcome as string }, { status });
}
