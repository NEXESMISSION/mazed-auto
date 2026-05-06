import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/messages/start
 *
 * Body: { sellerId: string, auctionId?: string }
 *
 * Returns the existing conversation between caller (as buyer) and the given
 * seller — anchored to the optional auction — or creates a new one. Routes
 * straight to /messages/[id].
 *
 * Refuses if the caller IS the seller (you can't open a chat with yourself).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sellerId?: string;
    auctionId?: string | null;
  };

  if (!body.sellerId) {
    return NextResponse.json({ error: "sellerId required" }, { status: 400 });
  }
  if (body.sellerId === user.id) {
    return NextResponse.json(
      { error: "cannot message yourself" },
      { status: 400 },
    );
  }

  const auctionId = body.auctionId ?? null;

  // Try to find an existing conversation first.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("seller_id", body.sellerId)
    .is("auction_id", auctionId)
    .maybeSingle();

  // The `is` filter above doesn't quite match an explicit eq for non-null
  // auction ids — fall back to that:
  let conversationId = existing?.id;
  if (!conversationId && auctionId) {
    const { data: byAuction } = await supabase
      .from("conversations")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("seller_id", body.sellerId)
      .eq("auction_id", auctionId)
      .maybeSingle();
    conversationId = byAuction?.id;
  }

  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        buyer_id: user.id,
        seller_id: body.sellerId,
        auction_id: auctionId,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    conversationId = created.id;
  }

  return NextResponse.json({ id: conversationId });
}
