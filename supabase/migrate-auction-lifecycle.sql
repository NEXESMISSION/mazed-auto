-- ============================================================
-- Mazed Auto — auction lifecycle, refunds, report auto-action
-- Safe to run repeatedly.
-- ============================================================

-- 1) Anti-sniping notification: extend the bid trigger to ALSO send
--    'reminder' (auction extended) notifications to every distinct prior bidder
--    when the end_time gets pushed.
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
  v_other_bidder record;
begin
  select status, seller_id, current_price, bid_increment, end_time, reserve_price, make, model, year
    into v_status, v_seller, v_current, v_increment, v_end, v_reserve, v_make, v_model, v_year
  from public.auctions
  where id = new.auction_id
  for update;

  if not found then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_status not in ('active', 'ending') then raise exception 'AUCTION_NOT_ACTIVE'; end if;
  if now() >= v_end then raise exception 'AUCTION_ENDED'; end if;
  if new.user_id is not null and new.user_id = v_seller then raise exception 'SELLER_CANNOT_BID'; end if;
  if new.amount < v_current + v_increment then raise exception 'BID_TOO_LOW'; end if;

  if v_end - now() <= interval '5 minutes' then
    v_end := v_end + interval '5 minutes';
    v_extended := true;
  end if;

  select count(distinct coalesce(user_id::text, bidder_label)) into v_participants
    from public.bids where auction_id = new.auction_id;

  select user_id into v_prev_bidder
    from public.bids
   where auction_id = new.auction_id and id <> new.id and user_id is not null
   order by amount desc, placed_at desc limit 1;

  update public.auctions
     set current_price = new.amount,
         total_bids = total_bids + 1,
         total_participants = v_participants,
         reserve_met = (v_reserve is null or new.amount >= v_reserve),
         end_time = v_end,
         status = case when v_extended then 'ending' else status end
   where id = new.auction_id;

  -- Outbid notification for the immediately previous high bidder
  if v_prev_bidder is not null and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_prev_bidder, new.auction_id, 'outbid', 'Votre offre a été dépassée',
            v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT');
  end if;

  -- Anti-sniping: notify every other bidder that the auction was extended
  if v_extended then
    for v_other_bidder in
      select distinct user_id
      from public.bids
      where auction_id = new.auction_id
        and user_id is not null
        and user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_other_bidder.user_id, new.auction_id, 'reminder',
              'Enchère prolongée de 5 minutes',
              v_make || ' ' || v_model || ' ' || v_year || ' — Nouvelle offre dans les dernières minutes');
    end loop;
  end if;

  return new;
end; $$;

-- 2) End-of-auction lifecycle:
--    when an auction transitions from active/ending → ended/reserve_not_met/cancelled,
--    fire winner notification, loser notifications, and refund losing deposits.
create or replace function public.finalize_auction(p_auction_id uuid)
returns void language plpgsql security definer as $$
declare
  v_winner uuid;
  v_winning_amount numeric;
  v_make text; v_model text; v_year int;
  v_status text;
begin
  select status, make, model, year into v_status, v_make, v_model, v_year
    from public.auctions where id = p_auction_id;

  if v_status = 'ended' then
    -- Find the winner (highest authenticated bid)
    select user_id, amount into v_winner, v_winning_amount
    from public.bids
    where auction_id = p_auction_id and user_id is not null
    order by amount desc, placed_at asc
    limit 1;

    if v_winner is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_winner, p_auction_id, 'won', 'Félicitations ! Vous avez gagné l''enchère',
              v_make || ' ' || v_model || ' ' || v_year || ' à ' || v_winning_amount::text || ' DT — complétez le paiement final');

      -- Notify every other bidder that they lost + refund their deposit
      insert into public.notifications (user_id, auction_id, kind, title, body)
      select distinct user_id, p_auction_id, 'lost', 'Enchère terminée',
             v_make || ' ' || v_model || ' ' || v_year || ' — Vous n''avez pas gagné cette fois. Votre caution sera remboursée sous 24 heures.'
      from public.bids
      where auction_id = p_auction_id and user_id is not null and user_id <> v_winner;

      update public.transactions
         set status = 'completed', label = label || ' (remboursée)'
       where auction_id = p_auction_id
         and type = 'deposit'
         and direction = 'out'
         and user_id is not null
         and user_id <> v_winner;

      insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
      select 'TX-RF-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || substring(b.id::text from 1 for 4),
             b.user_id,
             b.bidder_label,
             p_auction_id,
             'refund',
             'in',
             a.participation_deposit,
             'Remboursement caution — ' || a.make || ' ' || a.model || ' ' || a.year,
             'completed'
      from (select distinct on (user_id) user_id, bidder_label, id
              from public.bids
             where auction_id = p_auction_id and user_id is not null and user_id <> v_winner) b
      cross join public.auctions a
      where a.id = p_auction_id;
    end if;
  elsif v_status = 'reserve_not_met' then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    select distinct user_id, p_auction_id, 'lost', 'Prix de réserve non atteint',
           v_make || ' ' || v_model || ' ' || v_year || ' — Vente annulée. Votre caution sera remboursée.'
    from public.bids where auction_id = p_auction_id and user_id is not null;

    insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
    select 'TX-RF-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || substring(b.id::text from 1 for 4),
           b.user_id, b.bidder_label, p_auction_id, 'refund', 'in',
           a.participation_deposit,
           'Remboursement caution — ' || a.make || ' ' || a.model || ' ' || a.year,
           'completed'
    from (select distinct on (user_id) user_id, bidder_label, id
            from public.bids where auction_id = p_auction_id and user_id is not null) b
    cross join public.auctions a where a.id = p_auction_id;
  end if;
end; $$;

-- 3) Hook finalize_auction into end_expired_auctions
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select id from public.auctions
    where status in ('active','ending') and end_time <= now()
  loop
    update public.auctions a
       set status = case
         when a.total_bids = 0                     then 'cancelled'
         when a.reserve_price is not null
              and a.current_price < a.reserve_price then 'reserve_not_met'
         else 'ended'
       end
     where a.id = r.id;

    perform public.finalize_auction(r.id);
  end loop;
end; $$;

-- 4) Reports auto-action ladder (§16.2)
--    on each new report, count open+reviewing reports for the auction
--    1 → notify seller (handled at app layer)
--    3 → flip auction status to pending_review
--    5 → cancel auction + Trust Score deduction
create or replace function public.handle_new_report()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
  v_seller uuid;
  v_make text; v_model text; v_year int;
begin
  select count(*) into v_count
  from public.reports
  where auction_id = new.auction_id and status in ('open','reviewing');

  select seller_id, make, model, year
    into v_seller, v_make, v_model, v_year
    from public.auctions where id = new.auction_id;

  if v_seller is not null then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_seller, new.auction_id, 'system',
            'Nouveau signalement sur votre enchère',
            v_make || ' ' || v_model || ' ' || v_year || ' — Un signalement a été reçu, veuillez vérifier');
  end if;

  if v_count >= 5 then
    update public.auctions
       set status = 'cancelled'
     where id = new.auction_id and status in ('active','ending','pending_review');
    update public.sellers
       set trust_score = greatest(0, trust_score - 30)
     where id = v_seller;
    if v_seller is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'rejected',
              'Votre enchère a été annulée',
              'Le nombre de signalements a dépassé la limite autorisée. 30 points ont été déduits du Trust Score.');
    end if;
  elsif v_count >= 3 then
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
