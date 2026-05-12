-- ============================================================
-- Round 25 — search-path hardening for every SECURITY DEFINER fn
-- ============================================================
--
-- Postgres' SECURITY DEFINER means a function runs with the privileges
-- of its OWNER (postgres / supabase_admin in our case) rather than the
-- CALLER. That's intentional — most of our admin RPCs need to bypass
-- RLS to do their job — but it has a sharp edge: if the function's
-- search_path isn't pinned, the OWNER can be coerced into executing an
-- attacker-controlled function or operator just by mentioning an
-- unqualified table or function name. The classic exploit:
--
--   1. Attacker creates a schema, e.g. CREATE SCHEMA evil;
--   2. Attacker creates a function evil.upper(text) that does damage.
--   3. Attacker sets their session search_path to 'evil, public'.
--   4. Calls a SECURITY DEFINER fn that does `upper(some_text)`.
--   5. Without a pinned search_path on the function, postgres picks
--      evil.upper because evil is earlier in the search path — and
--      runs it as the OWNER.
--
-- The fix is one ALTER per function: `SET search_path = public, pg_temp`.
-- pg_temp must come last so temp-table lookups still work but can't
-- shadow the public schema.
--
-- We have 60+ SECURITY DEFINER functions across 25+ migrations. Rather
-- than hand-edit each one (brittle, easy to miss future additions),
-- this migration introspects pg_proc and applies the ALTER to every
-- SECURITY DEFINER function in `public` that doesn't already have a
-- pinned search_path. Re-running is a no-op once the search_path is
-- set, so this is fully idempotent and safe to land in CI.

DO $migration$
DECLARE
  fn record;
  applied_count int := 0;
BEGIN
  FOR fn IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true   -- SECURITY DEFINER only
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) AS c
          WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.nspname, fn.proname, fn.args
    );
    applied_count := applied_count + 1;
  END LOOP;
  RAISE NOTICE 'search_path pinned on % SECURITY DEFINER function(s)',
               applied_count;
END
$migration$;


-- ============================================================
-- Round 25 — remove blanket EXCEPTION WHEN OTHERS in auto-bid trigger
-- ============================================================
--
-- `handle_auto_bid_after()` wraps the recursive INSERT in a generic
--    BEGIN ... EXCEPTION WHEN OTHERS THEN NULL END
-- block. The intent is good — don't roll back the ORIGINAL user bid
-- just because a downstream auto-bid placement raced and lost — but
-- the implementation is too broad: every error class (programming
-- bugs, RLS denials, constraint violations, deadlocks) ends in the
-- same silent swallow. There's no way to tell from logs whether the
-- auto-bid chain stopped because all caps were exhausted (correct) or
-- because something genuinely broke (bug).
--
-- The fix preserves the "don't fail the outer txn" guarantee but
-- emits a NOTICE on every swallow so postgres logs (and our future
-- pg_audit setup) can surface the failure. Production GUC has
-- log_min_messages = notice, so these will show up in supabase logs.
-- Local dev / supabase studio also surfaces NOTICE.

CREATE OR REPLACE FUNCTION public.handle_auto_bid_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_auction record;
  v_top_auto record;
  v_next numeric;
BEGIN
  SELECT status, current_price, bid_increment, seller_id, end_time
    INTO v_auction
    FROM public.auctions WHERE id = new.auction_id;

  IF v_auction.status NOT IN ('active','ending') THEN RETURN new; END IF;
  IF now() >= v_auction.end_time THEN RETURN new; END IF;

  -- Find the highest active auto-bid that:
  --   - is not from the user who just placed this bid
  --   - is not from the seller
  --   - has enough budget for at least the next legal bid
  SELECT user_id, max_amount INTO v_top_auto
  FROM public.auto_bids
  WHERE auction_id = new.auction_id
    AND is_active = true
    AND user_id <> v_auction.seller_id
    AND user_id <> COALESCE(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND max_amount >= v_auction.current_price + v_auction.bid_increment
  ORDER BY max_amount DESC, created_at ASC
  LIMIT 1;

  IF v_top_auto.user_id IS NULL THEN RETURN new; END IF;

  v_next := least(v_top_auto.max_amount, v_auction.current_price + v_auction.bid_increment);
  IF v_next < v_auction.current_price + v_auction.bid_increment THEN RETURN new; END IF;

  -- Recursive: this insert fires handle_new_bid (validates, updates
  -- auction) and then handle_auto_bid_after again. We catch errors so
  -- the outer transaction (the user's manual bid) commits even if the
  -- auto chain fails partway, BUT we log the failure so we can tell
  -- "all caps exhausted" (no exception, correct) from "bug or deadlock"
  -- (NOTICE in postgres log, investigate).
  BEGIN
    INSERT INTO public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    VALUES (
      new.auction_id,
      v_top_auto.user_id,
      'Auto-Bid',
      v_next,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE
      'auto-bid placement failed (auction=%, bidder=%, amount=%, sqlstate=%): %',
      new.auction_id, v_top_auto.user_id, v_next, SQLSTATE, SQLERRM;
  END;

  RETURN new;
END;
$fn$;

-- Trigger already exists from migrate-real-features.sql; the
-- CREATE OR REPLACE above re-defines the function in place without
-- needing to drop+recreate the trigger.
