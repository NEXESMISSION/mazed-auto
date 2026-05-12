-- ============================================================
-- Mazed Auto — wire the final 3 dormant notification kinds:
--   - handle_new_bid          → auction_extended (on anti-sniping)
--   - handle_new_report       → new_report (replaces "system")
--   - handle_final_payment    → rating_request (after final payment)
--
-- Combined with rounds 18 + 19, this leaves only 2 kinds dormant:
--   - kyc_expires_soon       (needs an expiry-check cron)
--   - auction_starting_soon  (needs a scheduled-publish cron)
--
-- Safe to run repeatedly.
-- ============================================================


-- 1) handle_new_bid — auction_extended notification on anti-sniping --------
-- When a bid in the last N minutes pushes end_time out, the seller (and
-- bidders, but we'd spam them) should know the auction's gotten longer.
-- We notify just the seller, dedup'd to once per 60s so a frenzy doesn't
-- produce ten alerts.
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
  v_extended_already boolean;
begin
  -- KYC enforcement
  if new.user_id is not null and not public.is_kyc_verified(new.user_id) then
    raise exception 'NOT_KYC_VERIFIED'
      using hint = 'Complete identity verification before bidding.';
  end if;

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

  -- Outbid dedup
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

  -- auction_extended for the seller — dedup'd to once per 60s so a
  -- closing-flurry doesn't fire ten extension alerts in a row.
  if v_extended and v_seller is not null then
    select exists(
      select 1 from public.notifications
       where user_id    = v_seller
         and auction_id = new.auction_id
         and kind       = 'auction_extended'
         and is_read    = false
         and created_at >= now() - interval '60 seconds'
    ) into v_extended_already;
    if not v_extended_already then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'auction_extended',
        'Enchère prolongée',
        v_make || ' ' || v_model || ' ' || v_year
          || ' — Offre dans les dernières minutes, fin repoussée de '
          || v_extension_min::text || ' minutes.');
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid after insert on public.bids
for each row execute function public.handle_new_bid();


-- 2) handle_new_report — use new_report kind for the seller's alert -------
create or replace function public.handle_new_report()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
  v_seller uuid;
  v_make text; v_model text; v_year int;
  v_review_threshold int;
  v_remove_threshold int;
  v_penalty int;
begin
  v_review_threshold := public.get_setting_num('report.auto_review_threshold', 3)::int;
  v_remove_threshold := public.get_setting_num('report.auto_remove_threshold', 7)::int;
  v_penalty          := public.get_setting_num('trust.report_cancellation_penalty', 30)::int;

  select count(*) into v_count
  from public.reports
  where auction_id = new.auction_id and status in ('open','reviewing');

  select seller_id, make, model, year
    into v_seller, v_make, v_model, v_year
    from public.auctions where id = new.auction_id;

  if v_seller is not null
     and not public.notification_recent_unread(v_seller, 'new_report', new.auction_id, 60) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_seller, new.auction_id, 'new_report',
            'Nouveau signalement sur votre enchère',
            v_make || ' ' || v_model || ' ' || v_year || ' — Un signalement a été reçu, veuillez vérifier');
  end if;

  if v_count >= v_remove_threshold then
    update public.auctions
       set status = 'cancelled'
     where id = new.auction_id and status in ('active','ending','pending_review');
    update public.sellers
       set trust_score = greatest(0, trust_score - v_penalty)
     where id = v_seller;
    if v_seller is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'rejected',
              'Votre enchère a été annulée',
              'Le nombre de signalements a dépassé la limite autorisée. '
              || v_penalty || ' points ont été déduits du Trust Score.');
    end if;
  elsif v_count >= v_review_threshold then
    update public.auctions
       set status = 'pending_review'
     where id = new.auction_id and status in ('active','ending');
    if v_seller is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'system',
              'Votre enchère est en cours de modération',
              'Plusieurs signalements reçus — l''enchère est temporairement suspendue pour examen.');
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_report on public.reports;
create trigger trg_new_report after insert on public.reports
for each row execute function public.handle_new_report();


-- 3) handle_final_payment — emit rating_request to the buyer --------------
-- Extends the existing trust-score bump trigger to also insert a
-- rating_request notification for the buyer, dedup'd against any
-- existing rating row so the prompt doesn't reappear after they rate.
create or replace function public.handle_final_payment()
returns trigger language plpgsql security definer as $$
declare
  v_seller_id uuid;
  v_make text; v_model text; v_year int;
  v_already_rated boolean;
begin
  if new.type <> 'final_payment' or new.status <> 'completed' then
    return new;
  end if;
  if new.auction_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.transactions t
    where t.auction_id = new.auction_id
      and t.type = 'final_payment'
      and t.status = 'completed'
      and t.id <> new.id
  ) then
    return new;
  end if;

  select seller_id, make, model, year
    into v_seller_id, v_make, v_model, v_year
  from public.auctions
  where id = new.auction_id;

  if v_seller_id is null then
    return new;
  end if;

  update public.sellers
     set successful_deals = successful_deals + 1,
         trust_score = least(500, trust_score + 10)
   where id = v_seller_id;

  -- Rating request to the buyer. Skip if they've already rated this
  -- seller via this auction, or if a recent rating_request alert
  -- already exists (idempotency for webhook retries).
  if new.user_id is not null and new.user_id <> v_seller_id then
    select exists(
      select 1 from public.seller_ratings
       where seller_id  = v_seller_id
         and rater_id   = new.user_id
         and auction_id = new.auction_id
    ) into v_already_rated;
    if not v_already_rated
       and not public.notification_recent_unread(new.user_id, 'rating_request', new.auction_id, 86400) then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (new.user_id, new.auction_id, 'rating_request',
        'Évaluez votre vendeur',
        v_make || ' ' || v_model || ' ' || v_year
          || ' — Comment s''est passée la transaction ? Votre note aide la communauté.');
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_final_payment_trust on public.transactions;
create trigger trg_final_payment_trust
after insert on public.transactions
for each row execute function public.handle_final_payment();


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'auction_extended / new_report / rating_request notification kinds wired';
end $$;
