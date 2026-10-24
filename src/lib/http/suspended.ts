import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentRequestLocale } from "@/i18n/api";
import { phraseText } from "@/lib/publication";

/**
 * A suspended account keeps read access, but it may not put an annonce in
 * front of buyers: no draft saved, no submission, no renewal.
 *
 * `profiles.banned_at` used to be checked only by the v2 bid and deposit
 * triggers, so a banned seller could still publish. The database now refuses
 * the transition itself (`_listings_block_banned`, migration 0183); this is
 * the answer the wizard can show instead of a generic failure when the trigger
 * fires — in the language of the page that called.
 *
 *   const refused = await refuseIfSuspended(admin, user.id);
 *   if (refused) return refused;
 */
export async function refuseIfSuspended(
  admin: SupabaseClient,
  userId: string,
): Promise<NextResponse | null> {
  const { data } = await admin
    .from("profiles")
    .select("banned_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.banned_at) return null;
  return NextResponse.json(
    {
      error: "account_suspended",
      detail: phraseText({ key: "accountSuspended" }, await currentRequestLocale()),
    },
    { status: 403 },
  );
}
