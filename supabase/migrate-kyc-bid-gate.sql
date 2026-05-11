-- ============================================================
-- Mazed Auto — Server-side KYC enforcement on bids
--
-- Audit finding (round-2 #4): the bid path checked KYC by reading
-- `user_metadata.kycStatus`. That field is client-writable via
-- supabase.auth.updateUser, so a malicious user could self-set
-- kycStatus="verified" and bid without actually completing KYC.
--
-- Server-side fix:
--   1. New `is_kyc_verified(uuid)` helper reads from `sellers.verified_kyc`,
--      which is only flipped to true by the SECURITY DEFINER `review_kyc`
--      RPC. No client can set it.
--   2. The `handle_new_bid` trigger raises NOT_KYC_VERIFIED before
--      mutating any state. Defence in depth — even if the page-level
--      server gate is somehow bypassed, the trigger refuses the bid.
--
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.is_kyc_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select verified_kyc from public.sellers where id = p_user_id),
    false
  )
$$;

revoke all on function public.is_kyc_verified(uuid) from public;
grant execute on function public.is_kyc_verified(uuid) to authenticated, anon;


-- Patch handle_new_bid to enforce KYC before processing the bid.
-- The body is otherwise the same as migrate-bid-buynow-hardening.sql.
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
  -- KYC enforcement (server-side, authoritative). Anonymous bids
  -- (no user_id) are allowed for legacy / system-seeded rows;
  -- production bids always have a user_id and must be verified.
  if new.user_id is not null and not public.is_kyc_verified(new.user_id) then
    raise exception 'NOT_KYC_VERIFIED'
      using hint = 'Complete identity verification before bidding.';
  end if;

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

  -- Outbid dedup (60s window) — see migrate-bid-buynow-hardening.sql.
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


-- Also block buy_now for unverified users — same threat model.
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
  if not public.is_kyc_verified(p_buyer_id) then
    raise exception 'NOT_KYC_VERIFIED'
      using hint = 'Complete identity verification before buying.';
  end if;

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


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'is_kyc_verified() helper and KYC-gated bid/buy_now installed';
end $$;
