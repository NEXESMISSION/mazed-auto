import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records one hit on `key` and says whether it is past `max` in the window —
 * the database's `check_rate_limit` (one counter per key, shared by every
 * server instance, unlike an in-memory limiter).
 *
 * Fails OPEN: if the counter cannot be read, the request goes through. These
 * limits stop floods; a database hiccup must not stop a payment.
 */
export async function overLimit(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowSecs: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_secs: windowSecs,
  });
  return !error && data === true;
}

export function tooMany(detail = "Trop de demandes. Réessayez dans un moment."): NextResponse {
  return NextResponse.json({ error: "rate_limited", detail }, { status: 429 });
}
