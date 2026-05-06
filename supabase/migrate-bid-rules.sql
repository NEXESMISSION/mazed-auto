-- ============================================================
-- Mazed Auto — bid rules, anti-sniping, deposit gate, auto-end
-- Safe to run repeatedly.
-- ============================================================

-- 1) Stronger handle_new_bid:
--    - rejects amounts <= current_price + bid_increment
--    - blocks the seller from bidding on their own auction
--    - blocks bids on non-active auctions
--    - applies anti-sniping (extends end_time by 5 min if bid is in last 5 min)
--    - inserts an outbid notification for the previous high bidder
create or replace function public.handle_new_bid()
returns trigger language plpgsql security definer as $$
declare
  v_status text;
  v_seller uuid;
  v_current numeric;
  v_increment numeric;
  v_end timestamptz;
  v_reserve numeric;
  v_make text; v_model text; v_year int;
  v_prev_bidder uuid;
  v_participants int;
  v_extended boolean := false;
begin
  -- Lock the auction row to serialize concurrent bids
  select status, seller_id, current_price, bid_increment, end_time, reserve_price, make, model, year
    into v_status, v_seller, v_current, v_increment, v_end, v_reserve, v_make, v_model, v_year
  from public.auctions
  where id = new.auction_id
  for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  if v_status not in ('active', 'ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  if now() >= v_end then
    raise exception 'AUCTION_ENDED';
  end if;

  if new.user_id is not null and new.user_id = v_seller then
    raise exception 'SELLER_CANNOT_BID';
  end if;

  if new.amount < v_current + v_increment then
    raise exception 'BID_TOO_LOW';
  end if;

  -- Anti-sniping: any bid in the last 5 min pushes end_time +5 min
  if v_end - now() <= interval '5 minutes' then
    v_end := v_end + interval '5 minutes';
    v_extended := true;
  end if;

  select count(distinct coalesce(user_id::text, bidder_label))
    into v_participants
  from public.bids
  where auction_id = new.auction_id;

  select user_id into v_prev_bidder
  from public.bids
  where auction_id = new.auction_id
    and id <> new.id
    and user_id is not null
  order by amount desc, placed_at desc
  limit 1;

  update public.auctions
     set current_price = new.amount,
         total_bids = total_bids + 1,
         total_participants = v_participants,
         reserve_met = (v_reserve is null or new.amount >= v_reserve),
         end_time = v_end,
         status = case when v_extended then 'ending' else status end
   where id = new.auction_id;

  if v_prev_bidder is not null and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (
      v_prev_bidder,
      new.auction_id,
      'outbid',
      'Votre offre a été dépassée',
      v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT'
    );
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid after insert on public.bids
for each row execute function public.handle_new_bid();

-- 2) Deposit gate
--    A user can only bid on an auction if they have a 'completed' deposit
--    transaction for that auction. Enforced via a BEFORE-INSERT trigger.
create or replace function public.require_deposit_before_bid()
returns trigger language plpgsql security definer as $$
declare
  v_paid int;
begin
  -- Allow demo bids without a user_id (label-only bids from seed)
  if new.user_id is null then
    return new;
  end if;

  select count(*) into v_paid
  from public.transactions
  where user_id = new.user_id
    and auction_id = new.auction_id
    and type = 'deposit'
    and status = 'completed';

  if v_paid = 0 then
    raise exception 'DEPOSIT_REQUIRED';
  end if;

  return new;
end; $$;

drop trigger if exists trg_deposit_gate on public.bids;
create trigger trg_deposit_gate before insert on public.bids
for each row execute function public.require_deposit_before_bid();

-- 3) Auto-end auctions whose end_time has passed.
--    Call this from the server when reading auctions; it's idempotent and cheap.
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
begin
  update public.auctions a
     set status = case
       when a.total_bids = 0                     then 'cancelled'
       when a.reserve_price is not null
            and a.current_price < a.reserve_price then 'reserve_not_met'
       else 'ended'
     end
   where a.status in ('active','ending')
     and a.end_time <= now();
end; $$;

-- 4) End auction immediately for buy-now (called from app)
create or replace function public.buy_now(p_auction_id uuid, p_buyer_id uuid)
returns void language plpgsql security definer as $$
declare
  v_buy_now numeric;
  v_seller uuid;
begin
  select buy_now_price, seller_id into v_buy_now, v_seller
  from public.auctions where id = p_auction_id for update;

  if v_buy_now is null then
    raise exception 'NO_BUY_NOW_PRICE';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'SELLER_CANNOT_BUY';
  end if;

  update public.auctions
     set current_price = v_buy_now,
         status = 'ended',
         reserve_met = true,
         end_time = now()
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_buyer_id, p_auction_id, 'won', 'Félicitations ! Vous avez gagné l''enchère',
          'La voiture a été achetée au prix Acheter maintenant — prête pour le paiement final');
end; $$;
