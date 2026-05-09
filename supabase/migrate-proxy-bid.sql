-- ============================================================
-- Mazed Auto — proxy bidding (PLAN §7.2.7)
--
-- Aligns Auto-Bid with the proxy bidding model used by eBay / Copart /
-- Manheim. The user submits a HIDDEN max cap; the system bids on their
-- behalf at the smallest amount needed to lead — never more.
--
--   Current price = MIN(highest_cap, second_highest_cap + increment)
--   Winner        = highest cap holder (oldest cap wins on a tie)
--   Cap           = can be raised, NEVER lowered
--
-- This migration:
--   1. Replaces handle_auto_bid_after with a smarter version that jumps
--      directly to (runner_max + increment) instead of stepping by one
--      increment per insert. Convergence: 1-2 inserts instead of N.
--   2. Adds a SECURITY DEFINER RPC `place_auto_bid` that is the single
--      entry point for setting/raising a cap. Validates the business
--      rules (auction live, deposit paid, cap >= starting price,
--      cap >= existing cap) and inserts the optimal proxy bid.
--
-- Safe to run repeatedly. Depends on schema.sql + migrate-real-features.sql.
-- ============================================================

-- ---------- 1) Smarter proxy trigger ----------
create or replace function public.handle_auto_bid_after()
returns trigger language plpgsql security definer as $$
declare
  v_auction record;
  v_top record;
  v_runner_max numeric;
  v_target numeric;
begin
  select * into v_auction from public.auctions where id = new.auction_id;
  if v_auction.status not in ('active', 'ending') then
    return new;
  end if;

  -- Highest active cap that's not the just-bidder's and not the seller.
  -- Tiebreaker: older cap wins (created_at asc).
  select user_id, max_amount, created_at
    into v_top
  from public.auto_bids
  where auction_id = new.auction_id
    and is_active = true
    and user_id <> v_auction.seller_id
    and user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and max_amount >= v_auction.current_price + v_auction.bid_increment
  order by max_amount desc, created_at asc
  limit 1;

  if v_top.user_id is null then
    return new;
  end if;

  -- Runner-up cap = highest active cap among everyone except the leader.
  -- Includes the new bidder's own cap, if any. Jumping straight to
  -- (runner_max + increment) collapses the proxy chain into a single
  -- insert instead of stepping increment-by-increment.
  select coalesce(max(max_amount), 0)
    into v_runner_max
  from public.auto_bids
  where auction_id = new.auction_id
    and is_active = true
    and user_id <> v_top.user_id
    and user_id <> v_auction.seller_id;

  -- Counter target: smallest amount that beats the new manual bid AND
  -- the runner-up cap, capped at the leader's own ceiling.
  v_target := greatest(
    v_auction.current_price + v_auction.bid_increment,
    v_runner_max + v_auction.bid_increment,
    new.amount + v_auction.bid_increment
  );
  v_target := least(v_top.max_amount, v_target);

  -- Belt-and-suspenders: never insert below the legal floor.
  if v_target < v_auction.current_price + v_auction.bid_increment then
    return new;
  end if;

  -- Recursive: this insert fires handle_new_bid (validates, updates the
  -- auction) and handle_auto_bid_after again. We swallow exceptions so
  -- the original bid commits even if the auto chain hiccups partway.
  begin
    insert into public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    values (new.auction_id, v_top.user_id, 'Auto-Bid', v_target, true);
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_auto_bid_after on public.bids;
create trigger trg_auto_bid_after
  after insert on public.bids
  for each row execute function public.handle_auto_bid_after();

-- ---------- 2) place_auto_bid RPC ----------
-- Single entry point used by the client. Validates business rules then
-- upserts the cap and inserts ONE proxy bid at the optimal price. The
-- handle_auto_bid_after trigger handles any rival-cap counter chain.
create or replace function public.place_auto_bid(
  p_auction_id uuid,
  p_max_amount numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_auction record;
  v_existing record;
  v_deposit_count int;
  v_runner_max numeric;
  v_my_target numeric;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_max_amount is null or p_max_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_auction from public.auctions where id = p_auction_id for update;
  if v_auction.id is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_auction.status not in ('active', 'ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  if v_user = v_auction.seller_id then
    raise exception 'SELLER_CANNOT_BID';
  end if;

  -- Deposit gate — same rule as manual bids.
  select count(*) into v_deposit_count
  from public.transactions
  where user_id = v_user
    and auction_id = p_auction_id
    and type = 'deposit'
    and status = 'completed';
  if v_deposit_count = 0 then
    raise exception 'DEPOSIT_REQUIRED';
  end if;

  -- Cap must clear the auction floor. Below-current-price caps are
  -- allowed (the user just won't lead until they raise it) but caps
  -- below the starting price are nonsense.
  if p_max_amount < v_auction.starting_price then
    raise exception 'CAP_BELOW_STARTING';
  end if;

  -- "User can raise the cap, but never lower it." (PLAN §7.2.7)
  select * into v_existing
  from public.auto_bids
  where auction_id = p_auction_id and user_id = v_user;
  if v_existing.id is not null
     and v_existing.is_active = true
     and p_max_amount < v_existing.max_amount then
    raise exception 'CAP_CANNOT_DECREASE';
  end if;

  -- Upsert the cap.
  insert into public.auto_bids (auction_id, user_id, max_amount, is_active, cancelled_at)
  values (p_auction_id, v_user, p_max_amount, true, null)
  on conflict (auction_id, user_id) do update
    set max_amount   = excluded.max_amount,
        is_active    = true,
        cancelled_at = null;

  -- Compute MY proxy price given everyone else's caps. runner_max is the
  -- highest cap among rivals (excluding seller). I bid the smallest
  -- amount that clears (runner_max + inc) but never exceed my own cap.
  -- If runner_max already ties or beats my cap, I bid my whole cap and
  -- the trigger lets the rival counter back to (my_cap + inc).
  select coalesce(max(max_amount), 0)
    into v_runner_max
  from public.auto_bids
  where auction_id = p_auction_id
    and is_active = true
    and user_id <> v_user
    and user_id <> v_auction.seller_id;

  v_my_target := greatest(
    v_auction.current_price + v_auction.bid_increment,
    v_runner_max + v_auction.bid_increment
  );
  v_my_target := least(p_max_amount, v_my_target);

  -- Only place a bid if it would actually clear the legal floor. A user
  -- raising a too-low cap (e.g. cap=22K when current=30K) just stores
  -- the cap and waits for the price to come back down (it won't, but
  -- we don't reject the cap — they may raise it later).
  if v_my_target >= v_auction.current_price + v_auction.bid_increment then
    insert into public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    values (p_auction_id, v_user, 'Auto-Bid', v_my_target, true);
  end if;
end;
$$;

grant execute on function public.place_auto_bid(uuid, numeric) to authenticated;
