"use server";

import { createClient } from "@/lib/supabase/server";

/** Allowed MIME types for receipt uploads. Receipts come from the
 *  user's phone gallery or camera so we accept the same image formats
 *  as KYC + auction photo capture, plus PDF in case they download a
 *  bank-app statement. */
const ALLOWED_RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
// 8 MB — generous since the client compresses raster images first;
// PDFs from bank apps are usually <1 MB. Server-side cap is the only
// defence if the client compression is bypassed.
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export type SubmitResult =
  | { ok: true; txId: string }
  | { ok: false; error: string };

/**
 * Manual-payment intake. Uploads the user's receipt image/PDF to the
 * private payment-receipts bucket (scoped to `<userId>/...` by storage
 * RLS), then calls submit_manual_payment() which creates a
 * pending_verification transaction the admin will then approve or
 * reject from /admin/transactions.
 *
 * Server-side here so the user never needs to bundle their own
 * Supabase service-role key, and so the upload + RPC happen in one
 * round-trip — partial failures (file uploaded, RPC failed) are
 * cleanly visible to the caller.
 */
export async function submitManualPayment(
  formData: FormData,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "AUTH_REQUIRED" };

  const file = formData.get("receipt");
  const auctionId = (formData.get("auctionId") as string) || null;
  const amount = Number(formData.get("amount") ?? 0);
  const type = String(formData.get("type") ?? "deposit");
  const method = String(formData.get("method") ?? "");

  if (!(file instanceof File)) return { ok: false, error: "FILE_MISSING" };
  if (!file.size) return { ok: false, error: "EMPTY_FILE" };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: "FILE_TOO_LARGE" };
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_RECEIPT_MIME.has(mime)) {
    return { ok: false, error: "MIME_NOT_ALLOWED" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }
  if (method !== "bank_transfer" && method !== "d17") {
    return { ok: false, error: "INVALID_METHOD" };
  }
  if (type !== "deposit" && type !== "final" && type !== "subscription") {
    return { ok: false, error: "INVALID_TYPE" };
  }

  // Path: <userId>/<timestamp>-<rand>.<ext>. RLS verifies the first
  // folder segment equals auth.uid() so an attacker can't smuggle
  // a file into someone else's folder.
  const ext = MIME_EXT[mime] ?? "jpg";
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${Date.now()}-${rand}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("payment-receipts")
    .upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  // The bucket is private — store the storage path, NOT a public URL.
  // Admins read the file via a short-lived signed URL when they review.
  const receiptUrl = path;

  const { data: txId, error: rpcError } = await supabase.rpc(
    "submit_manual_payment",
    {
      p_auction_id: auctionId,
      p_amount: amount,
      p_type: type,
      p_method: method,
      p_receipt_url: receiptUrl,
    },
  );

  if (rpcError) {
    // Best-effort cleanup of the orphan upload — ignore deletion errors
    // (the path is in the user's own folder so cleanup-on-failure is
    // not a leak risk even if it doesn't run).
    await supabase.storage.from("payment-receipts").remove([path]).catch(() => {});
    return { ok: false, error: rpcError.message };
  }

  return { ok: true, txId: txId as string };
}
