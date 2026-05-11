"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin";

/**
 * Central server-action layer for the admin panel.
 *
 * Every action:
 *   1. resolves the caller and refuses non-admins (defense in depth —
 *      RLS already blocks them, but a nice error message beats a
 *      "permission denied for table" noise)
 *   2. dispatches to a SECURITY DEFINER RPC, which re-checks the
 *      capability and writes to admin_audit_log
 *   3. revalidates the relevant admin page so the UI updates
 *
 * Returns a discriminated union so the caller can render localized
 * text per error code without the server formatting strings.
 */

type Ok<T = unknown> = { ok: true; data?: T };
type Err = { ok: false; error: string };
type Result<T = unknown> = Ok<T> | Err;

async function ensureAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };
  const role = getAdminRole(user);
  if (!role) return { ok: false, error: "NOT_ADMIN" };
  return { ok: true, supabase };
}

// ----- USER ACTIONS -----

export async function warnUserAction(input: {
  userId: string;
  severity: "info" | "warning" | "severe";
  body: string;
  relatedAuctionId?: string | null;
  relatedReportId?: string | null;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_warn_user", {
    p_user_id: input.userId,
    p_severity: input.severity,
    p_body: input.body,
    p_related_auction_id: input.relatedAuctionId ?? null,
    p_related_report_id: input.relatedReportId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function banUserAction(input: {
  userId: string;
  reason: string;
  scope?: "full" | "bidding" | "selling" | "messaging";
  durationDays?: number | null;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_ban_user", {
    p_user_id: input.userId,
    p_reason: input.reason,
    p_scope: input.scope ?? "full",
    p_duration_days: input.durationDays ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  revalidatePath(`/[locale]/admin/users`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function unbanUserAction(input: {
  userId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_unban_user", {
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  revalidatePath(`/[locale]/admin/users`, "page");
  return { ok: true };
}

export async function resetKycAction(input: {
  userId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_reset_kyc", {
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  revalidatePath(`/[locale]/admin/kyc-queue`, "page");
  return { ok: true };
}

export async function setOwnershipVerifiedAction(input: {
  userId: string;
  value: boolean;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_set_ownership_verified", {
    p_user_id: input.userId,
    p_value: input.value,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

export async function setProAction(input: {
  userId: string;
  value: boolean;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_set_pro", {
    p_user_id: input.userId,
    p_value: input.value,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

export async function adminSetRoleAction(input: {
  userId: string;
  role:
    | "super_admin"
    | "admin"
    | "moderator"
    | "support"
    | "finance"
    | null;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_set_role", {
    p_user_id: input.userId,
    p_role: input.role,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

// ----- AUCTION ACTIONS -----

export async function requestAuctionEditAction(input: {
  auctionId: string;
  fields: string[];
  message: string;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc(
    "admin_request_auction_edit",
    {
      p_auction_id: input.auctionId,
      p_fields: input.fields,
      p_message: input.message,
    },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function resolveEditRequestAction(input: {
  requestId: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_resolve_edit_request", {
    p_request_id: input.requestId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function forceCancelAuctionAction(input: {
  auctionId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_force_cancel_auction", {
    p_auction_id: input.auctionId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  revalidatePath(`/[locale]/admin/transactions`, "page");
  return { ok: true };
}

export async function forceSellerDecisionAction(input: {
  auctionId: string;
  choice: "accept" | "reject";
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_force_seller_decision", {
    p_auction_id: input.auctionId,
    p_choice: input.choice,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function forceEndAuctionAction(input: {
  auctionId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_force_end_auction", {
    p_auction_id: input.auctionId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function extendAuctionEndAction(input: {
  auctionId: string;
  minutes: number;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_extend_auction_end", {
    p_auction_id: input.auctionId,
    p_minutes: input.minutes,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function setAuctionFeaturedAction(input: {
  auctionId: string;
  featured: boolean;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_set_auction_featured", {
    p_auction_id: input.auctionId,
    p_featured: input.featured,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function setAuctionVipAction(input: {
  auctionId: string;
  vip: boolean;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_set_auction_vip", {
    p_auction_id: input.auctionId,
    p_vip: input.vip,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

export async function invalidateBidAction(input: {
  bidId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_invalidate_bid", {
    p_bid_id: input.bidId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true };
}

// ----- FINANCIAL -----

export async function voidTransactionAction(input: {
  txId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_void_transaction", {
    p_tx_id: input.txId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/transactions`, "page");
  return { ok: true };
}

export async function createTransactionAction(input: {
  userId: string;
  type: "deposit" | "refund" | "final_payment" | "commission" | "payout";
  direction: "in" | "out";
  amount: number;
  label: string;
  auctionId?: string | null;
  reason?: string | null;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_create_transaction", {
    p_user_id: input.userId,
    p_type: input.type,
    p_direction: input.direction,
    p_amount: input.amount,
    p_label: input.label,
    p_auction_id: input.auctionId ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/transactions`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function createPayoutAction(input: {
  sellerId: string;
  auctionId: string | null;
  gross: number;
  commission: number;
  tva: number;
  rib?: string | null;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_create_payout", {
    p_seller_id: input.sellerId,
    p_auction_id: input.auctionId,
    p_gross: input.gross,
    p_commission: input.commission,
    p_tva: input.tva,
    p_rib: input.rib ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/payouts`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function markPayoutPaidAction(input: {
  payoutId: string;
  reference: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_mark_payout_paid", {
    p_id: input.payoutId,
    p_reference: input.reference,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/payouts`, "page");
  return { ok: true };
}

export async function cancelPayoutAction(input: {
  payoutId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_cancel_payout", {
    p_id: input.payoutId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/payouts`, "page");
  return { ok: true };
}

// ----- BROADCAST -----

export async function createBroadcastAction(input: {
  title: string;
  body: string;
  kind?: string;
  audience: "all" | "buyers" | "sellers" | "admins" | "auction_bidders" | "custom";
  audienceFilter?: Record<string, unknown> | null;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_broadcast_create", {
    p_title: input.title,
    p_body: input.body,
    p_kind: input.kind ?? "system",
    p_audience: input.audience,
    p_audience_filter: input.audienceFilter ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/broadcasts`, "page");
  return { ok: true, data: { id: data as string } };
}

// ----- SPRINT A: edit, re-verify, bulk, DM, refund -----

export async function editAuctionAction(input: {
  auctionId: string;
  patch: Record<string, unknown>;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_edit_auction", {
    p_auction_id: input.auctionId,
    p_patch: input.patch as never,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions/[id]`, "page");
  return { ok: true };
}

export async function resetEmailVerificationAction(input: {
  userId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc(
    "admin_reset_email_verification",
    { p_user_id: input.userId, p_reason: input.reason },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

export async function resetPhoneVerificationAction(input: {
  userId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc(
    "admin_reset_phone_verification",
    { p_user_id: input.userId, p_reason: input.reason },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

export async function bulkReviewKycAction(input: {
  submissionIds: string[];
  decision: "approved" | "rejected";
  reason?: string | null;
}): Promise<Result<{ count: number }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_bulk_review_kyc", {
    p_submission_ids: input.submissionIds,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/kyc-queue`, "page");
  return { ok: true, data: { count: (data as number) ?? 0 } };
}

export async function bulkApproveAuctionsAction(input: {
  auctionIds: string[];
}): Promise<Result<{ count: number }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc(
    "admin_bulk_approve_auctions",
    { p_auction_ids: input.auctionIds },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true, data: { count: (data as number) ?? 0 } };
}

export async function bulkRejectAuctionsAction(input: {
  auctionIds: string[];
  reason: string;
}): Promise<Result<{ count: number }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc(
    "admin_bulk_reject_auctions",
    { p_auction_ids: input.auctionIds, p_reason: input.reason },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/auctions-queue`, "page");
  return { ok: true, data: { count: (data as number) ?? 0 } };
}

export async function dmUserAction(input: {
  userId: string;
  title: string;
  body: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_dm_user", {
    p_user_id: input.userId,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

export async function refundDepositAction(input: {
  txId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_refund_deposit", {
    p_tx_id: input.txId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/transactions`, "page");
  return { ok: true };
}

// ----- SETTINGS APPROVAL -----

export async function proposeSettingAction(input: {
  key: string;
  newValue: unknown;
  reason?: string | null;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("propose_setting_value", {
    p_key: input.key,
    p_new_value: input.newValue as never,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/settings`, "page");
  return { ok: true };
}

export async function approvePendingSettingAction(input: {
  key: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("approve_pending_setting", {
    p_key: input.key,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/settings`, "page");
  return { ok: true };
}

export async function rejectPendingSettingAction(input: {
  key: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("reject_pending_setting", {
    p_key: input.key,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/settings`, "page");
  return { ok: true };
}

// ----- FORFEITS (caution retention) -----

export async function adminForceForfeitAction(input: {
  auctionId: string;
  reason: string;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc("admin_force_forfeit", {
    p_auction_id: input.auctionId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/forfeits`, "page");
  revalidatePath(`/[locale]/admin/auctions/[id]`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function adminReverseForfeitAction(input: {
  forfeitId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc("admin_reverse_forfeit", {
    p_forfeit_id: input.forfeitId,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/forfeits`, "page");
  return { ok: true };
}

export async function adminExtendPaymentDeadlineAction(input: {
  auctionId: string;
  days: number;
  reason: string;
}): Promise<Result<{ newDeadline: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc(
    "admin_extend_payment_deadline",
    {
      p_auction_id: input.auctionId,
      p_days: input.days,
      p_reason: input.reason,
    },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/forfeits`, "page");
  revalidatePath(`/[locale]/admin/auctions/[id]`, "page");
  return { ok: true, data: { newDeadline: data as string } };
}

// ----- SUBSCRIPTIONS -----

export async function adminSetUserSubscriptionAction(input: {
  userId: string;
  planSlug: string;
  days: number;
  reason: string;
}): Promise<Result<{ id: string }>> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { data, error } = await gate.supabase.rpc(
    "admin_set_user_subscription",
    {
      p_user_id: input.userId,
      p_plan_slug: input.planSlug,
      p_days: input.days,
      p_reason: input.reason,
    },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true, data: { id: data as string } };
}

export async function adminCancelUserSubscriptionAction(input: {
  userId: string;
  reason: string;
}): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.rpc(
    "admin_cancel_user_subscription",
    {
      p_user_id: input.userId,
      p_reason: input.reason,
    },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/[locale]/admin/users/[id]`, "page");
  return { ok: true };
}

// Self-serve subscribe / cancel actions live in
// `src/app/[locale]/subscription-actions.ts` to keep this admin module
// focused on admin-only mutations. /pricing and /profile/subscription
// import from there.
