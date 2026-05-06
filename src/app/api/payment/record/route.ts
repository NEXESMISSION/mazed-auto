import { NextRequest, NextResponse } from "next/server";
import { createClient as createBrowser } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

interface Body {
  ref: string;
  amount: number;
  type: "deposit" | "final" | "subscription";
  auctionId: string | null;
  buyNow?: boolean;
}

export async function POST(request: NextRequest) {
  // Identify the user from their session
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const { ref, amount, type, auctionId, buyNow } = body;

  if (!ref || !amount || !type) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const meta = (user.user_metadata ?? {}) as {
    firstName?: string;
    lastName?: string;
  };
  const userLabel =
    [meta.firstName, meta.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "utilisateur";

  const dbType =
    type === "final"
      ? "final_payment"
      : type === "subscription"
        ? "commission"
        : "deposit";
  const label =
    type === "deposit"
      ? "Caution de participation"
      : type === "final"
        ? "Paiement final"
        : "Abonnement";

  // Service-role client bypasses RLS so the transactions row is reliably written.
  const admin = createBrowser(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Idempotency: the client uses a stable `ref` per payment, but React strict
  // mode (and refreshes / back-navigation) can fire the effect more than once.
  // Short-circuit if this ref is already recorded.
  {
    const { data: existing } = await admin
      .from("transactions")
      .select("id, user_id")
      .eq("ref", ref)
      .maybeSingle();
    if (existing) {
      if (existing.user_id !== user.id) {
        return NextResponse.json(
          { error: "ref belongs to a different user" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  const { error: insertErr } = await admin.from("transactions").insert({
    ref,
    user_id: user.id,
    user_label: userLabel,
    auction_id: auctionId,
    type: dbType,
    direction: "out",
    amount,
    label,
    status: "completed",
  });

  if (insertErr) {
    // Race: a concurrent request may have inserted in between our existence
    // check and this insert. If the conflict is on `ref` and the row now
    // belongs to this user, treat as success.
    if (insertErr.code === "23505") {
      const { data: now } = await admin
        .from("transactions")
        .select("user_id")
        .eq("ref", ref)
        .maybeSingle();
      if (now?.user_id === user.id) {
        return NextResponse.json({ ok: true, deduped: true });
      }
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Buy-now: close the auction immediately
  if (buyNow && auctionId) {
    const { error: rpcErr } = await admin.rpc("buy_now", {
      p_auction_id: auctionId,
      p_buyer_id: user.id,
    });
    if (rpcErr) {
      // The transaction is already recorded, surface the error but don't fail
      return NextResponse.json({
        ok: true,
        warning: rpcErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
