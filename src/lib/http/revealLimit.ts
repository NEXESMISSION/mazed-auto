import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientIp } from "@/lib/clientIp";
import { localeFromRequest } from "@/i18n/api";

/**
 * The one throttle on revealing a phone number, whoever's number it is.
 *
 * A buyer looks at a handful of annonces and shops in an evening; a harvester
 * looks at hundreds. Listings (/api/annonces/[id]/contact) and shops
 * (/api/boutiques/[slug]/contact) draw on the SAME bucket per device, so
 * alternating between the two does not buy a second allowance.
 */
export const MAX_REVEALS_PER_IP_PER_HOUR = 40;

/**
 * The client IP, hashed with a server secret so the logs cannot be reversed
 * into a list of IP addresses by anyone who gets a copy of them.
 */
export function revealIpHash(req: NextRequest): string {
  const ip = clientIp(req) || "unknown";
  const salt = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mazed";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Records the hit; true once this device is over the hourly cap. */
export async function overRevealLimit(admin: SupabaseClient, ipHash: string): Promise<boolean> {
  const { data } = await admin.rpc("check_rate_limit", {
    p_key: `reveal:${ipHash}`,
    p_max: MAX_REVEALS_PER_IP_PER_HOUR,
    p_window_secs: 3600,
  });
  return data === true;
}

/** The 429's sentence, in the language of the page that asked. */
export function revealLimitedDetail(req: Request): string {
  return localeFromRequest(req) === "ar"
    ? "تمّ الاطلاع على أرقام كثيرة من هذا الجهاز. أعد المحاولة لاحقًا."
    : "Trop de numéros consultés depuis cet appareil. Réessayez plus tard.";
}
