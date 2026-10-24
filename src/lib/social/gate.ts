import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Is the Social Publisher open? `app_settings.social_publisher.enabled` opens
 * it to shops; until then an admin sees it as a preview — the same switch as
 * the shop pages (`shopsGate`).
 */
export async function socialGate(admin: SupabaseClient): Promise<{ enabled: boolean; preview: boolean; visible: boolean }> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "social_publisher").maybeSingle();
  const enabled = (data?.value as { enabled?: boolean } | null)?.enabled === true;
  if (enabled) return { enabled, preview: false, visible: true };
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { enabled, preview: false, visible: false };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  return { enabled, preview: isAdmin, visible: isAdmin };
}

/**
 * Does this shop's plan include written-for-you texts? Lot S1: any running
 * period (STARTER and up, D-S7). Lot S2 reads it from the plan's limits.
 */
export async function shopMayUseAi(admin: SupabaseClient, shopId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("subscriptions")
    .select("id")
    .eq("shop_id", shopId)
    .in("status", ["active", "grace"])
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * The version of the consent text (`social.composer.consent` in
 * messages/social/*.json), stored with every consent so what was agreed to can
 * always be shown again. Change the text → change the version.
 */
export const CONSENT_VERSION = "2026-10-24";
