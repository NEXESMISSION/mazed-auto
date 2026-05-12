/**
 * Admin RBAC + audit helpers.
 *
 * The platform has 5 admin roles (PLAN §22.2):
 *   super_admin → everything
 *   admin       → everything except user.delete + admin.role.assign
 *   moderator   → KYC / auctions / reports / warn-suspend
 *   support     → read-only + reply to messages/contact
 *   finance     → financials (payouts, refunds, voids)
 *
 * Mirrors the SQL `public.has_admin_capability(cap)` helper so UI and
 * RPC agree on what each role can do. Never trust the client — RPCs
 * re-check; this is for hiding/showing buttons only.
 */

export type AdminRole =
  | "super_admin"
  | "admin"
  | "moderator"
  | "support"
  | "finance";

export const ADMIN_ROLES: AdminRole[] = [
  "super_admin",
  "admin",
  "moderator",
  "support",
  "finance",
];

export type AdminCapability =
  | "user.view"
  | "user.warn"
  | "user.suspend"
  | "user.delete"
  | "kyc.review"
  | "auction.view"
  | "auction.moderate"
  | "auction.edit_request"
  | "report.view"
  | "report.moderate"
  | "report.financial.export"
  | "transaction.view"
  | "transaction.refund"
  | "transaction.void"
  | "transaction.adjust"
  | "payout.create"
  | "payout.mark_paid"
  | "broadcast.create"
  | "message.read_for_moderation"
  | "contact.reply"
  | "settings.read"
  | "settings.propose"
  | "settings.approve"
  | "admin.manage"
  | "admin.role.assign";

const CAPS_BY_ROLE: Record<AdminRole, AdminCapability[] | "*"> = {
  super_admin: "*",
  admin: [
    "user.view",
    "user.warn",
    "user.suspend",
    "kyc.review",
    "auction.view",
    "auction.moderate",
    "auction.edit_request",
    "report.view",
    "report.moderate",
    "report.financial.export",
    "transaction.view",
    "transaction.refund",
    "transaction.void",
    "transaction.adjust",
    "payout.create",
    "payout.mark_paid",
    "broadcast.create",
    "message.read_for_moderation",
    "contact.reply",
    "settings.read",
    "settings.propose",
    "settings.approve",
  ],
  moderator: [
    "user.view",
    "user.warn",
    "user.suspend",
    "kyc.review",
    "auction.view",
    "auction.moderate",
    "auction.edit_request",
    "report.view",
    "report.moderate",
    "broadcast.create",
    "settings.read",
  ],
  support: [
    "user.view",
    "user.warn",
    "auction.view",
    "report.view",
    "message.read_for_moderation",
    "contact.reply",
    "broadcast.create",
    "settings.read",
  ],
  finance: [
    "user.view",
    "auction.view",
    "transaction.view",
    "transaction.refund",
    "transaction.void",
    "transaction.adjust",
    "payout.create",
    "payout.mark_paid",
    "report.financial.export",
    "settings.read",
  ],
};

/**
 * Best-effort role read from a Supabase user object.
 *
 * Source-of-truth precedence (round-22 audit fix M-1):
 *   1. `app_metadata.adminRole` — service-role-only writes, trustworthy.
 *   2. `user_metadata.adminRole` — legacy mirror, kept for backwards
 *      compat with sessions issued before migrate-admin-role-app-metadata.
 *      A signed-in user CAN forge this via supabase.auth.updateUser, so
 *      treat it as a hint only.
 *   3. legacy `user_metadata.role === 'admin'` boolean.
 *
 * Server-side authorization MUST NOT trust this function alone — every
 * destructive RPC re-checks via SQL `is_admin()` / `has_admin_capability()`
 * which read from the `admin_users` table.
 */
export function getAdminRole(user: {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): AdminRole | null {
  if (!user) return null;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const appExplicit = appMeta.adminRole;
  if (
    typeof appExplicit === "string" &&
    ADMIN_ROLES.includes(appExplicit as AdminRole)
  ) {
    return appExplicit as AdminRole;
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const explicit = meta.adminRole;
  if (typeof explicit === "string" && ADMIN_ROLES.includes(explicit as AdminRole)) {
    return explicit as AdminRole;
  }
  if (meta.role === "admin") return "admin";
  return null;
}

export function hasCapability(
  role: AdminRole | null | undefined,
  cap: AdminCapability,
): boolean {
  if (!role) return false;
  const caps = CAPS_BY_ROLE[role];
  return caps === "*" || caps.includes(cap);
}

/** Idle-timeout window for the admin shell (PLAN §22.3). */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
