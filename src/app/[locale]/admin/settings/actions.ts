"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { invalidateSettingsCache } from "@/lib/config";
import { getAdminRole, hasCapability } from "@/lib/admin";

/**
 * Update a single platform_setting. Stores raw text from the form,
 * coerces it to the right shape based on the row's `type`, and writes
 * the result. Gated to admins with the `settings.approve` capability
 * (super_admin + admin). The audit log trigger captures who changed
 * what; we only need to pass the new value here.
 */
export async function updateSettingAction(
  key: string,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  // Admin gate. Without this, ANY signed-in user could change
  // commission rates, KYC thresholds, etc. — the previous version had
  // only the auth check and a TODO. Audit finding #2.
  const role = getAdminRole(user);
  if (!hasCapability(role, "settings.approve")) {
    return { ok: false, error: "NOT_AUTHORIZED" };
  }

  // Look up the row so we know what shape to coerce into.
  const { data: row, error: readErr } = await supabase
    .from("platform_settings")
    .select("type, key")
    .eq("key", key)
    .maybeSingle();
  if (readErr || !row) {
    return { ok: false, error: readErr?.message ?? "SETTING_NOT_FOUND" };
  }

  let parsed: unknown;
  try {
    if (row.type === "number") {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) throw new Error("not a number");
      parsed = n;
    } else if (row.type === "boolean") {
      const v = rawValue.trim().toLowerCase();
      if (v === "true" || v === "1") parsed = true;
      else if (v === "false" || v === "0") parsed = false;
      else throw new Error('use "true" or "false"');
    } else if (row.type === "json") {
      parsed = JSON.parse(rawValue);
    } else {
      // string — keep verbatim
      parsed = rawValue;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid";
    return { ok: false, error: `Invalid value (${row.type}): ${msg}` };
  }

  const { error: writeErr } = await supabase
    .from("platform_settings")
    .update({
      value: parsed as never,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);

  if (writeErr) return { ok: false, error: writeErr.message };

  invalidateSettingsCache(key);
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true };
}
