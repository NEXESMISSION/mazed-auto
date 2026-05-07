-- ============================================================
-- Mazed Auto — handle_new_bid reads anti-sniping from platform_settings
-- Run AFTER migrate-platform-settings.sql (depends on get_setting_num()).
-- Safe to run repeatedly.
-- ============================================================

-- ---------- Compute participation_deposit from settings on insert ----------
-- The deposit % moves from client code into the DB so a client that
-- hasn't refreshed can't ship a stale 5% when Admin has bumped it.
create or replace function public.set_auction_deposit()
returns trigger language plpgsql security definer as $$
declare
  v_pct numeric;
begin
  v_pct := public.get_setting_num('auction.deposit.starting_pct', 0.05);
  new.participation_deposit := round(new.starting_price * v_pct);
  return new;
end; $$;

drop trigger if exists trg_set_auction_deposit on public.auctions;
create trigger trg_set_auction_deposit
before insert on public.auctions
for each row execute function public.set_auction_deposit();

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
  -- Fallbacks (5/5) match the historical hardcoded values so behavior is
  -- preserved if the settings rows are missing for any reason.
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
