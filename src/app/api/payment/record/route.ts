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

  // Validate `amount` aggressively. JSON.parse will happily accept
  // negative numbers, NaN (as the literal `null` after sanitization), or
  // a JavaScript-formatted `Infinity` (some clients stringify it). All
  // three pass `!amount` above because JS coerces Number.isFinite-false
  // values to truthy except 0 and NaN. The previous bug let a crafted
  // client POST `{"amount": -100000}` and credit themselves a refund.
  // Upper cap (10M DT) is well above the largest real-world car price
  // on the platform — anything above is either a typo or an attack.
  const MAX_AMOUNT_DT = 10_000_000;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT_DT
  ) {
    return NextResponse.json(
      { error: "invalid amount" },
      { status: 400 },
    );
  }
  // Restrict `type` to the documented enum — otherwise a request with
  // `{"type": "anything"}` falls through to the dbType ternary's else
  // branch and writes a row with `type: "deposit"` regardless of intent.
  if (type !== "deposit" && type !== "final" && type !== "subscription") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  // Bound `ref` length so a malicious client can't push a 1MB string
  // into the table's unique index (we can't easily put a length cap on
  // the column without a migration, but the API layer can).
  if (typeof ref !== "string" || ref.length > 128) {
    return NextResponse.json({ error: "invalid ref" }, { status: 400 });
  }
  // auctionId, when present, must look like a UUID. Passing arbitrary
  // strings to Postgres in a uuid column raises an opaque 500 from the
  // service-role client; we'd rather return a clean 400.
  if (
    auctionId != null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      auctionId,
    )
  ) {
    return NextResponse.json({ error: "invalid auctionId" }, { status: 400 });
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

  // Round-22 audit fix L-3: cross-check the client-supplied `amount`
  // against the canonical price for this auction so a malicious caller
  // can't record a 1-DT deposit/final-payment for a 50,000-DT car.
  // The fake-card flow lets the user "pay" any amount client-side, but
  // the ledger entry must reflect what the platform actually charges.
  //
  //   - deposit: must equal `auctions.participation_deposit`.
  //   - final + buyNow: must equal `auctions.buy_now_price`.
  //   - final without buyNow: must equal `auctions.current_price`
  //     (the winning-bid amount).
  //
  // Subscription type has no auction reference; its amount is bounded
  // by the validator above and idempotency prevents re-billing.
  if (auctionId && (type === "deposit" || type === "final")) {
    const { data: auctionRow, error: auctionErr } = await admin
      .from("auctions")
      .select("participation_deposit, current_price, buy_now_price, status")
      .eq("id", auctionId)
      .maybeSingle();
    if (auctionErr || !auctionRow) {
      return NextResponse.json(
        { error: "auction not found" },
        { status: 404 },
      );
    }
    let expected: number | null = null;
    if (type === "deposit") {
      expected = Number(auctionRow.participation_deposit);
    } else if (buyNow) {
      expected =
        auctionRow.buy_now_price !== null
          ? Number(auctionRow.buy_now_price)
          : null;
    } else {
      expected = Number(auctionRow.current_price);
    }
    if (expected === null || !Number.isFinite(expected) || expected <= 0) {
      return NextResponse.json(
        { error: "invalid auction price" },
        { status: 400 },
      );
    }
    // Allow a 1-DT rounding tolerance to account for the legacy
    // checkout UIs that used round() on the displayed deposit.
    if (Math.abs(amount - expected) > 1) {
      return NextResponse.json(
        { error: "amount does not match auction price" },
        { status: 400 },
      );
    }
  }

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
