"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Voluntary winner forfeit (PLAN §21.4). Validates the caller is logged
 * in, then delegates to the SQL function `forfeit_winner_deposit`, which
 * does the actual permission check (must be current top bidder), splits
 * the deposit per `auction.forfeit.{seller,platform}_share` settings, and
 * advances the auction to the next bidder.
 *
 * Returns a discriminated union so the client can render localized text
 * for each error code without the server formatting strings — same
 * pattern documented in MEMORY.md as the project's preferred shape.
 */
export type ForfeitResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "NOT_AUTHENTICATED"
        | "NOT_CURRENT_WINNER"
        | "ALREADY_PAID"
        | "AUCTION_NOT_FOUND"
        | "UNKNOWN";
      message?: string;
    };

export async function voluntaryForfeit(
  auctionId: string,
): Promise<ForfeitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "NOT_AUTHENTICATED" };

  const { error } = await supabase.rpc("forfeit_winner_deposit", {
    p_auction_id: auctionId,
    p_user_id: user.id,
    p_reason: "voluntary",
  });

  if (error) {
    // The SQL function raises with a specific message we can pattern-match.
    const msg = error.message || "";
    if (msg.includes("NOT_CURRENT_WINNER")) {
      return { ok: false, code: "NOT_CURRENT_WINNER" };
    }
    if (msg.includes("ALREADY_PAID")) {
      return { ok: false, code: "ALREADY_PAID" };
    }
    if (msg.includes("AUCTION_NOT_FOUND")) {
      return { ok: false, code: "AUCTION_NOT_FOUND" };
    }
    return { ok: false, code: "UNKNOWN", message: msg };
  }

  // Refresh the wins list + transactions on the client.
  revalidatePath("/buyer/wins");
  revalidatePath("/transactions");
  return { ok: true };
}
