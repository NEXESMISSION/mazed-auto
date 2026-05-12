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
// Round-22 audit fix M-3: cap the input size so a forged-admin caller
// (one who got past `getAdminRole` via spoofed user_metadata before the
// app_metadata switch lands everywhere) can't push a multi-MB blob
// through the parse path before RLS rejects the write. 4 KB is well
// above any legitimate platform setting (the largest today is a JSON
// list of ~30 deposit tiers, well under 1 KB).
const MAX_SETTING_VALUE_BYTES = 4096;
// Setting keys are lowercase dotted identifiers (e.g.
// `auction.payment.deadline_days`). Cap at 128 chars to match the
// platform_settings.key column convention.
const MAX_SETTING_KEY_BYTES = 128;
const SETTING_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export async function updateSettingAction(
  key: string,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Validate inputs BEFORE touching Supabase — cheap rejections first.
  if (typeof key !== "string" || !SETTING_KEY_RE.test(key)) {
    return { ok: false, error: "INVALID_KEY" };
  }
  if (typeof rawValue !== "string") {
    return { ok: false, error: "INVALID_VALUE" };
  }
  if (rawValue.length > MAX_SETTING_VALUE_BYTES) {
    return { ok: false, error: "VALUE_TOO_LARGE" };
  }
  // Defensive: the regex caps key length, but double-check in case the
  // regex is changed in the future without updating the cap.
  if (key.length > MAX_SETTING_KEY_BYTES) {
    return { ok: false, error: "KEY_TOO_LARGE" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  // Admin gate. Without this, ANY signed-in user could change
  // commission rates, KYC thresholds, etc. — the previous version had
  // only the auth check and a TODO. After round-22 fix M-1 this reads
  // app_metadata.adminRole first (un-forgeable) then falls back to
  // user_metadata for legacy sessions. The actual UPDATE is also
  // gated by RLS via SQL `is_admin()` (admin_users table).
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
