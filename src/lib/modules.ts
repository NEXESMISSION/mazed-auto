import type { SupabaseClient } from "@supabase/supabase-js";
import { availableMethods, readPaymentMethods, PAYMENT_METHODS_KEY, type KonnectMode } from "@/lib/payments";
import { konnectForLookup } from "@/lib/payments/konnectAccount";
import { appSecretsReady } from "@/lib/secrets";
import { readApprovals, REQUEST_KINDS } from "@/lib/shops/approvals";
import { readChannels } from "@/lib/notifications/channels";
import { isSmsConfigured } from "@/lib/winsms";
import { isEmailConfigured } from "@/lib/email";
import { metaConfig } from "@/lib/social/meta";
import { isSocialCryptoConfigured } from "@/lib/social/crypto";
import { isAiConfigured } from "@/lib/social/ai";

/**
 * « Fonctions » (D-B4): every module of the site, whether it runs, and what it
 * still needs. One place to see it all and switch it, so nothing runs that the
 * back office did not turn on — and nothing stays off for a reason nobody can
 * see.
 *
 * A module that needs a server key (Vercel) is READY once that key is there;
 * only then may it be switched on, here or by « Démarrer les fonctions
 * prêtes ». The check is the server's, at the moment of the switch: the
 * screen's own reading is never trusted for it.
 */

/** The modules this screen can switch itself. */
export const SWITCHABLE = ["shops", "konnect", "social", "sms", "email"] as const;
export type Switchable = (typeof SWITCHABLE)[number];

export type SiteModule = {
  key: Switchable | "approvals" | "manual" | "freeListings";
  on: boolean;
  /** Can be switched on: nothing missing. */
  ready: boolean;
  /** What is missing — server variables by name, or a screen to fill in. */
  missing: string[];
  /** Optional parts still missing (the module runs without them). */
  optional?: string[];
  /** Where it is set in detail. */
  href?: string;
  /** Numbers the line prints (methods open, annonces offered…). */
  detail?: Record<string, string | number>;
  switchable: boolean;
};

const KEYS = ["pro_shops", "social_publisher", "notification_channels", "pro_approvals", "free_listings", PAYMENT_METHODS_KEY];

const missingEnv = (names: string[]) => names.filter((n) => !process.env[n]?.trim());

export async function readModules(admin: SupabaseClient): Promise<SiteModule[]> {
  const [{ data }, konnectCfg] = await Promise.all([
    admin.from("app_settings").select("key, value").in("key", KEYS),
    konnectForLookup(admin),
  ]);
  const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  const enabled = (key: string) => (v[key] as { enabled?: boolean } | null)?.enabled === true;
  const channels = readChannels(v.notification_channels);
  const methods = readPaymentMethods(v[PAYMENT_METHODS_KEY]);
  const approvals = readApprovals(v.pro_approvals);
  const free = (v.free_listings ?? {}) as { enabled?: boolean; count?: number };

  const socialMissing = [
    ...(metaConfig() ? [] : missingEnv(["META_APP_ID", "META_APP_SECRET"])),
    ...(isSocialCryptoConfigured() ? [] : ["SOCIAL_TOKEN_KEY"]),
  ];
  const konnectMissing = konnectCfg
    ? []
    : [...(appSecretsReady() ? [] : ["SETTINGS_SECRET_KEY"]), "konnect_account"];

  return [
    { key: "shops", on: enabled("pro_shops"), ready: true, missing: [], switchable: true, href: "/admin/settings" },
    {
      key: "approvals",
      on: REQUEST_KINDS.some((k) => approvals[k]),
      ready: true,
      missing: [],
      switchable: false,
      href: "/admin/settings",
      detail: { count: REQUEST_KINDS.filter((k) => approvals[k]).length, total: REQUEST_KINDS.length },
    },
    {
      key: "manual",
      on: availableMethods(methods).length > 0,
      ready: true,
      missing: [],
      switchable: false,
      href: "/admin/moyens-paiement",
      detail: { count: availableMethods(methods).length },
    },
    {
      key: "konnect",
      on: methods.konnect.enabled,
      ready: konnectMissing.length === 0,
      missing: konnectMissing,
      switchable: true,
      href: "/admin/moyens-paiement",
      detail: { mode: methods.konnect.mode satisfies KonnectMode },
    },
    {
      key: "social",
      on: enabled("social_publisher"),
      ready: socialMissing.length === 0,
      missing: socialMissing,
      optional: isAiConfigured() ? [] : ["ANTHROPIC_API_KEY"],
      switchable: true,
    },
    {
      key: "sms",
      on: channels.sms,
      ready: isSmsConfigured(),
      missing: isSmsConfigured() ? [] : ["WINSMS_API_KEY"],
      switchable: true,
    },
    {
      key: "email",
      on: channels.email,
      ready: isEmailConfigured(),
      missing: isEmailConfigured() ? [] : missingEnv(["RESEND_API_KEY", "EMAIL_FROM"]),
      switchable: true,
    },
    {
      key: "freeListings",
      on: free.enabled === true && Number(free.count) > 0,
      ready: true,
      missing: [],
      switchable: false,
      href: "/admin/settings",
      detail: { count: Number(free.count) || 0 },
    },
  ];
}

/**
 * Switch one module. Turning off is always allowed; turning on only when the
 * module is ready (checked again here). Returns false when refused.
 */
export async function setModule(
  admin: SupabaseClient,
  key: Switchable,
  on: boolean,
  userId: string,
  modules?: SiteModule[],
): Promise<{ ok: boolean; error?: unknown }> {
  const f = (modules ?? (await readModules(admin))).find((x) => x.key === key);
  if (!f || (on && !f.ready)) return { ok: false };

  const upsert = async (settingKey: string, value: unknown) => {
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: settingKey, value, updated_by: userId }, { onConflict: "key" });
    return { ok: !error, error };
  };
  const current = async (settingKey: string) =>
    (await admin.from("app_settings").select("value").eq("key", settingKey).maybeSingle()).data?.value;

  switch (key) {
    case "shops":
      return upsert("pro_shops", { enabled: on });
    case "social":
      return upsert("social_publisher", { enabled: on });
    case "konnect": {
      const methods = readPaymentMethods(await current(PAYMENT_METHODS_KEY));
      return upsert(PAYMENT_METHODS_KEY, { ...methods, konnect: { ...methods.konnect, enabled: on } });
    }
    case "sms":
    case "email": {
      const channels = readChannels(await current("notification_channels"));
      return upsert("notification_channels", { ...channels, [key]: on });
    }
  }
}
