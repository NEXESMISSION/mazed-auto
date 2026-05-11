-- ============================================================
-- Mazed Auto — Hardening for buy_now() + outbid notification dedup
--
-- Audit findings:
--   #4 — buy_now() didn't check that the auction was still live;
--        two concurrent buy-now calls could both succeed (the second
--        one would overwrite the first's "ended" state).
--   outbid spam — handle_new_bid inserts an "outbid" notification on
--        every bid. In a closing flurry a user can collect 10+ alerts
--        in 30 seconds. Dedup against any unread outbid for the same
--        user+auction in the last 60 seconds.
--
-- Both fixes are atomic — the SELECT … FOR UPDATE inside the trigger /
-- function serialises everything that runs through it.
--
-- Safe to run repeatedly.
-- ============================================================

-- ---------------------------------------------------------
-- 1) Harden buy_now()
-- ---------------------------------------------------------
create or replace function public.buy_now(p_auction_id uuid, p_buyer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buy_now numeric;
  v_seller  uuid;
  v_status  text;
  v_end     timestamptz;
begin
  -- Lock the auction row so concurrent buy_now / place_bid calls serialise.
  select buy_now_price, seller_id, status, end_time
    into v_buy_now, v_seller, v_status, v_end
    from public.auctions
   where id = p_auction_id
   for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_buy_now is null then
    raise exception 'NO_BUY_NOW_PRICE';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'SELLER_CANNOT_BUY';
  end if;
  -- Was missing — without these two checks a second buy-now call after
  -- the auction had already ended would happily overwrite status/price.
  if v_status not in ('active','ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  if now() >= v_end then
    raise exception 'AUCTION_ENDED';
  end if;

  update public.auctions
     set current_price = v_buy_now,
         status        = 'ended',
         reserve_met   = true,
         end_time      = now()
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_buyer_id, p_auction_id, 'won',
          'Félicitations ! Vous avez gagné l''enchère',
          'La voiture a été achetée au prix Acheter maintenant — prête pour le paiement final');
end; $$;


-- ---------------------------------------------------------
-- 2) Outbid notification dedup window
-- ---------------------------------------------------------
-- Re-create the trigger to skip a notification if an unread outbid for
-- the same user+auction already exists from the last 60 seconds. A user
-- being outbid repeatedly in a closing flurry now gets ONE alert per
-- minute instead of one per bid.
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
  v_window_min numeric;
  v_extension_min numeric;
  v_recent_outbid_exists boolean;
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

  -- Anti-sniping: window + extension are configurable in platform_settings.
  v_window_min    := public.get_setting_num('auction.anti_sniping.window_minutes', 5);
  v_extension_min := public.get_setting_num('auction.anti_sniping.extension_minutes', 5);

  if v_end - now() <= make_interval(mins => v_window_min::int) then
    v_end := v_end + make_interval(mins => v_extension_min::int);
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

  -- Outbid notification — only if there isn't already a recent (within
  -- the last minute) unread outbid for this user+auction. Closing
  -- flurries used to generate 10+ alerts in 30 seconds; now it's 1/min.
  if v_prev_bidder is not null
     and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    select exists(
      select 1 from public.notifications
       where user_id    = v_prev_bidder
         and auction_id = new.auction_id
         and kind       = 'outbid'
         and is_read    = false
         and created_at >= now() - interval '60 seconds'
    ) into v_recent_outbid_exists;

    if not v_recent_outbid_exists then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (
        v_prev_bidder,
        new.auction_id,
        'outbid',
        'Votre offre a été dépassée',
        v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT'
      );
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid after insert on public.bids
for each row execute function public.handle_new_bid();


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'buy_now() and handle_new_bid() updated';
end $$;
